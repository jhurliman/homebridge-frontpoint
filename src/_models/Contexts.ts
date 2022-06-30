import { CharacteristicValue } from 'homebridge';

export interface BaseContext {
  accID: string,
  name: string,
}

export interface SensorContext extends BaseContext {
  state: CharacteristicValue,
  batteryLow: boolean,
  sensorType: any
}

export interface LightContext extends BaseContext {
  state: CharacteristicValue,
  desiredState: CharacteristicValue,
  isDimmer: boolean,
  lightLevel: number,
  lightType: string
}

export interface PartitionContext extends BaseContext {
  state: CharacteristicValue,
  desiredState: CharacteristicValue,
  statusFault: boolean,
  partitionType: 'default'
}

export interface LockContext extends BaseContext {
  accID: string,
  name: string,
  state: CharacteristicValue,
  desiredState: CharacteristicValue,
  lockType: string
}

export interface GarageContext extends BaseContext {
  accID: string,
  name: string,
  state: CharacteristicValue,
  desiredState: CharacteristicValue,
  garageType: string
}