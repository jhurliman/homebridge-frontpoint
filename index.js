const frontpoint = require('frontpoint')

const PLUGIN_ID = 'homebridge-frontpoint'
const PLUGIN_NAME = 'FrontPoint'
const MANUFACTURER = 'FrontPoint Security'
const AUTH_TIMEOUT_MS = 1000 * 60 * 10
const DEFAULT_REFRESH_S = 60

let Accessory, Service, Characteristic, UUIDGen

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  UUIDGen = homebridge.hap.uuid

  homebridge.registerPlatform(PLUGIN_ID, PLUGIN_NAME, FrontPointPlatform, true)
}

class FrontPointPlatform {
  constructor(log, config, api) {
    this.log = log
    this.config = config || { platform: PLUGIN_NAME }
    this.debug = this.config.debug || false

    if (!this.config.username)
      throw new Error('FrontPoint: Missing required username in config')
    if (!this.config.password)
      throw new Error('FrontPoint: Missing required password in config')

    this.config.refreshSeconds = this.config.refreshSeconds ?? DEFAULT_REFRESH_S
    if (!Number.isFinite(this.config.refreshSeconds) || this.config.refreshSeconds < 10 || this.config.refreshSeconds > 86400)
      throw new Error('refreshSeconds must be between 10 and 86400')

    this.accessories = Object.create(null)
    this.stopped = false
    this.loginPromise = null
    this.refreshPromise = null
    this.includeIDs = validateIDs(this.config.includeIDs, "includeIDs")
    this.excludeIDs = validateIDs(this.config.excludeIDs, "excludeIDs")
    this.authOpts = { expires: +new Date() - 1 }

    // Default arming mode options
    this.armingModes = {
      "away": {
        noEntryDelay: false,
        silentArming: false
      },
      "night": {
        noEntryDelay: false,
        silentArming: true
      },
      "stay": {
        noEntryDelay: false,
        silentArming: true
      }
    };

    // Overwrite default arming modes with config settings.
    if (this.config.armingModes !== undefined) {
      for(var key in this.config.armingModes) {
        if (!Object.hasOwn(this.armingModes, key)) throw new Error('Unknown arming mode')
        this.armingModes[key].noEntryDelay = Boolean(this.config.armingModes[key].noEntryDelay);
        this.armingModes[key].silentArming = Boolean(this.config.armingModes[key].silentArming);
      }
    }

    if (api) {
      this.api = api
      this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this))
      this.api.on('shutdown', () => { this.stopped = true; clearInterval(this.timerID) })
    }
  }

  // HomeBridge method overrides ///////////////////////////////////////////////

  didFinishLaunching() {
    if (this.timerID || this.stopped) return
    void this.refreshDevices()
    this.timerID = setInterval(() => { void this.refreshDevices() }, this.config.refreshSeconds * 1000)
    this.timerID.unref?.()
  }

  isVisible(id) {
    id = String(id)
    return (!this.includeIDs || this.includeIDs.has(id)) && !this.excludeIDs?.has(id)
  }

  configureAccessory(accessory) {
    this.log(
      `Loaded from cache: ${accessory.context.name} (${
        accessory.context.accID
      })`
    )

    if (!this.isVisible(accessory.context.accID)) { this.removeAccessory(accessory); return }
    const existing = this.accessories[accessory.context.accID]
    if (existing) this.removeAccessory(existing)

    if (accessory.context.partitionType) {
      this.setupPartition(accessory)
    } else if (accessory.context.sensorType) {
      this.setupSensor(accessory)
    } else {
      this.log(`Unrecognized accessory ${accessory.context.accID}`)
    }

    this.accessories[accessory.context.accID] = accessory
  }

  // Internal methods //////////////////////////////////////////////////////////

  login() {
    // Cache expiration check
    const now = +new Date()
    if (this.authOpts.expires > now) return Promise.resolve(this.authOpts)

    if (this.loginPromise) return this.loginPromise
    this.loginPromise = frontpoint.login(this.config.username, this.config.password)
      .then(authOpts => {
        this.authOpts = { ...authOpts, expires: Date.now() + AUTH_TIMEOUT_MS }
        return this.authOpts
      }).finally(() => { this.loginPromise = null })
    return this.loginPromise
  }

  listDevices() {
    return this.login()
      .then(res => fetchStateForAllSystems(res))
      .then(systemStates => {
        return systemStates.reduce(
          (out, system) => {
            out.partitions = out.partitions.concat(system.partitions)
            out.sensors = out.sensors.concat(system.sensors)
            return out
          },
          { partitions: [], sensors: [] }
        )
      })
  }

  refreshDevices() {
    if (this.stopped) return Promise.resolve()
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.listDevices().then(({ partitions, sensors }) => {
      if (this.stopped) return
      const found = new Set()
      for (const [devices, add, update] of [
        [partitions, 'addPartition', 'setPartitionState'],
        [sensors, 'addSensor', 'setSensorState']
      ]) {
        for (const device of devices) {
          if (!this.isVisible(device.id)) continue
          found.add(String(device.id))
          const accessory = this.accessories[device.id]
          if (accessory) this[update](accessory, device)
          else this[add](device)
        }
      }
      for (const accessory of Object.values(this.accessories)) {
        if (!found.has(String(accessory.context.accID))) this.removeAccessory(accessory)
      }
    }).catch(() => {
      this.authOpts.expires = 0
      this.log('FrontPoint refresh failed; check cloud connectivity and account access')
      for (const accessory of Object.values(this.accessories)) {
        const service = accessory.getService(Service.SecuritySystem)
        if (service) { accessory.context.statusFault = true; service.updateCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT) }
      }
    }).finally(() => { this.refreshPromise = null })
    return this.refreshPromise
  }

  addPartition(partition) {
    if (!this.isVisible(partition.id) || this.stopped) return
    const id = partition.id
    let accessory = this.accessories[id]
    if (accessory) this.removeAccessory(accessory)

    const name = partition.attributes.description
    const uuid = UUIDGen.generate(id)
    accessory = new Accessory(name, uuid)

    accessory.context = {
      accID: id,
      name: name,
      state: null,
      desiredState: null,
      statusFault: null,
      partitionType: 'default'
    }

    this.log(`Adding partition ${name} (id=${id}, uuid=${uuid})`)
    this.addAccessory(accessory, Service.SecuritySystem, 'Security Panel')

    this.setupPartition(accessory)

    // Set the initial partition state
    this.setPartitionState(accessory, partition)
  }

  setupPartition(accessory) {
    const id = accessory.context.accID
    const name = accessory.context.name
    const model = 'Security Panel'

    // Always reachable
    accessory.reachable = true

    // Setup HomeKit accessory information
    accessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, id)

    // Setup event listeners

    accessory.on('identify', (paired, callback) => {
      this.log(`${name} identify requested, paired=${paired}`)
      callback()
    })

    const service = accessory.getService(Service.SecuritySystem)

    service
      .getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .on('get', callback => accessory.context.state == null ? callback(new Error('State unavailable')) : callback(null, accessory.context.state))

    service
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on('get', callback => accessory.context.desiredState == null ? callback(new Error('State unavailable')) : callback(null, accessory.context.desiredState))
      .on('set', (value, callback) =>
        this.changePartitionState(accessory, value, callback)
      )

    service
      .getCharacteristic(Characteristic.StatusFault)
      .on('get', callback => callback(null, accessory.context.statusFault))
  }

  addSensor(sensor) {
    if (!this.isVisible(sensor.id) || this.stopped) return
    const id = sensor.id
    let accessory = this.accessories[id]
    if (accessory) this.removeAccessory(accessory)

    const [type, characteristic, model] = getSensorType(sensor)
    if (type === undefined) {
      this.log(`Warning: Sensor with unknown state ${sensor.attributes.state}`)
      return
    }

    const name = sensor.attributes.description
    const uuid = UUIDGen.generate(id)
    accessory = new Accessory(name, uuid)

    accessory.context = {
      accID: id,
      name: name,
      state: null,
      batteryLow: false,
      sensorType: model
    }

    this.log(`Adding ${model} "${name}" (id=${id}, uuid=${uuid})`)
    this.addAccessory(accessory, type, model)

    this.setupSensor(accessory)

    // Set the initial sensor state
    this.setSensorState(accessory, sensor)
  }

  setupSensor(accessory) {
    const id = accessory.context.accID
    const name = accessory.context.name
    const model = accessory.context.sensorType
    const [type, characteristic] = sensorModelToType(model)
    if (!characteristic)
      throw new Error(`Unrecognized sensor ${accessory.context.accID}`)

    // Always reachable
    accessory.reachable = true

    // Setup HomeKit accessory information
    accessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, id)

    // Setup event listeners

    accessory.on('identify', (paired, callback) => {
      this.log(`${name} identify requested, paired=${paired}`)
      callback()
    })

    const service = accessory.getService(type)

    service
      .getCharacteristic(characteristic)
      .on('get', callback => accessory.context.state == null ? callback(new Error('State unavailable')) : callback(null, accessory.context.state))

    service
      .getCharacteristic(Characteristic.StatusLowBattery)
      .on('get', callback => callback(null, accessory.context.batteryLow))
  }

  addAccessory(accessory, type, model) {
    const id = accessory.context.accID
    const name = accessory.context.name
    this.accessories[id] = accessory

    // Setup HomeKit service
    accessory.addService(type, name)

    // Register new accessory in HomeKit
    this.api.registerPlatformAccessories(PLUGIN_ID, PLUGIN_NAME, [accessory])
  }

  setPartitionState(accessory, partition) {
    const id = accessory.context.accID
    const state = getPartitionState(partition.attributes.state)
    const desiredState = getPartitionState(partition.attributes.desiredState)
    const statusFault = state === undefined || desiredState === undefined || Boolean(partition.attributes.needsClearIssuesPrompt)

    if (state !== accessory.context.state) {
      this.log(
        `Updating partition ${id}, state=${state}, prev=${
          accessory.context.state
        }`
      )

      accessory.context.state = state
      accessory
        .getService(Service.SecuritySystem)
        .getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .updateValue(state === undefined ? new Error('State unavailable') : state)
    }

    if (desiredState !== accessory.context.desiredState) {
      this.log(
        `Updating partition ${id}, desiredState=${desiredState}, prev=${
          accessory.context.desiredState
        }`
      )

      accessory.context.desiredState = desiredState
      accessory
        .getService(Service.SecuritySystem)
        .getCharacteristic(Characteristic.SecuritySystemTargetState)
        .updateValue(desiredState === undefined ? new Error('State unavailable') : desiredState)
    }

    if (statusFault !== accessory.context.statusFault) {
      this.log(
        `Updating partition ${id}, statusFault=${statusFault}, prev=${
          accessory.context.statusFault
        }`
      )

      accessory.context.statusFault = statusFault
      accessory
        .getService(Service.SecuritySystem)
        .getCharacteristic(Characteristic.StatusFault)
        .updateValue(statusFault)
    }
  }

  setSensorState(accessory, sensor) {
    const id = accessory.context.accID
    const state = getSensorState(sensor)
    const batteryLow = Boolean(
      sensor.attributes.lowBattery || sensor.attributes.criticalBattery
    )
    const [type, characteristic, model] = getSensorType(sensor)
    if (!type || !accessory.getService(type)) return

    if (state !== accessory.context.state) {
      this.log(
        `Updating sensor ${id}, state=${state}, prev=${accessory.context.state}`
      )

      accessory.context.state = state
      accessory
        .getService(type)
        .getCharacteristic(characteristic)
        .updateValue(state === undefined ? new Error('State unavailable') : state)
    }

    if (batteryLow !== accessory.context.batteryLow) {
      this.log(
        `Updating sensor ${id}, batteryLow=${batteryLow}, prev=${
          accessory.context.batteryLow
        }`
      )

      accessory.context.batteryLow = batteryLow
      accessory
        .getService(type)
        .getCharacteristic(Characteristic.StatusLowBattery)
        .updateValue(batteryLow)
    }
  }

  removeAccessory(accessory) {
    if (!accessory) return

    const id = accessory.context.accID
    this.log(`${accessory.context.name} (${id}) removed from HomeBridge.`)
    this.api.unregisterPlatformAccessories(PLUGIN_ID, PLUGIN_NAME, [accessory])
    delete this.accessories[id]
  }

  removeAccessories() {
    Object.values(this.accessories).forEach(accessory => this.removeAccessory(accessory))
  }

  changePartitionState(accessory, value, callback) {
    if (this.stopped) return callback(new Error('Plugin is shutting down'))
    const id = accessory.context.accID
    let method
    const opts = {}

    switch (value) {
      case Characteristic.SecuritySystemTargetState.STAY_ARM:
        method = frontpoint.armStay
        opts.noEntryDelay = this.armingModes.stay.noEntryDelay;
        opts.silentArming = this.armingModes.stay.silentArming;
        break
      case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
        method = frontpoint.armStay
        opts.noEntryDelay = this.armingModes.night.noEntryDelay;
        opts.silentArming = this.armingModes.night.silentArming;
        break
      case Characteristic.SecuritySystemTargetState.AWAY_ARM:
        method = frontpoint.armAway
        opts.noEntryDelay = this.armingModes.away.noEntryDelay;
        opts.silentArming = this.armingModes.away.silentArming;
        break
      case Characteristic.SecuritySystemTargetState.DISARM:
        method = frontpoint.disarm
        break
      default:
        const msg = `Can't set SecuritySystem to unknown value ${value}`
        this.log(msg)
        return callback(new Error(msg))
    }

    this.log(`changePartitionState(${accessory.context.accID}, ${value})`)

    this.login()
      .then(res => method(id, res, opts)) // Usually 20-30 seconds
      .then(res => res.data)
      .then(partition => this.setPartitionState(accessory, partition))
      .then(_ => callback())
      .catch(err => {
        this.log('FrontPoint command failed; refreshing state')
        this.refreshDevices()
        callback(new Error("FrontPoint command failed"))
      })
  }
}

function fetchStateForAllSystems(res) {
  return Promise.all(res.systems.map(id => frontpoint.getCurrentState(id, res)))
}

function getPartitionState(state) {
  switch (state) {
    case frontpoint.SYSTEM_STATES.ARMED_STAY:
      return Characteristic.SecuritySystemCurrentState.STAY_ARM
    case frontpoint.SYSTEM_STATES.ARMED_AWAY:
      return Characteristic.SecuritySystemCurrentState.AWAY_ARM
    case frontpoint.SYSTEM_STATES.ARMED_NIGHT:
      return Characteristic.SecuritySystemCurrentState.NIGHT_ARM
    case frontpoint.SYSTEM_STATES.DISARMED:
      return Characteristic.SecuritySystemCurrentState.DISARMED
    default:
      return undefined
  }
}

function getSensorState(sensor) {
  switch (sensor.attributes.state) {
    case frontpoint.SENSOR_STATES.OPEN:
      return Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
    case frontpoint.SENSOR_STATES.CLOSED:
      return Characteristic.ContactSensorState.CONTACT_DETECTED
    case frontpoint.SENSOR_STATES.ACTIVE:
      return Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
    case frontpoint.SENSOR_STATES.IDLE:
      return Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED
    case frontpoint.SENSOR_STATES.WET:
      return Characteristic.LeakDetected.LEAK_DETECTED
    case frontpoint.SENSOR_STATES.DRY:
      return Characteristic.LeakDetected.LEAK_NOT_DETECTED
    default:
      return undefined
  }
}

function getSensorType(sensor) {
  const state = sensor.attributes.state

  switch (state) {
    case frontpoint.SENSOR_STATES.CLOSED:
    case frontpoint.SENSOR_STATES.OPEN:
      return [
        Service.ContactSensor,
        Characteristic.ContactSensorState,
        'Contact Sensor'
      ]
    case frontpoint.SENSOR_STATES.IDLE:
    case frontpoint.SENSOR_STATES.ACTIVE:
      return [
        Service.OccupancySensor,
        Characteristic.OccupancyDetected,
        'Occupancy Sensor'
      ]
    case frontpoint.SENSOR_STATES.DRY:
    case frontpoint.SENSOR_STATES.WET:
      return [Service.LeakSensor, Characteristic.LeakDetected, 'Leak Sensor']
    default:
      return [undefined, undefined, undefined]
  }
}

function sensorModelToType(model) {
  switch (model) {
    case 'Contact Sensor':
      return [Service.ContactSensor, Characteristic.ContactSensorState]
    case 'Occupancy Sensor':
      return [Service.OccupancySensor, Characteristic.OccupancyDetected]
    case 'Leak Sensor':
      return [Service.LeakSensor, Characteristic.LeakDetected]
    default:
      return [undefined, undefined]
  }
}

function validateIDs(ids, name) {
  if (ids === undefined) return null
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.length)) throw new Error(`${name} must be an array of IDs`)
  return new Set(ids)
}
