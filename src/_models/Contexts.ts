import { CharacteristicValue } from 'homebridge';
import { SensorType } from 'node-alarm-dot-com';

export interface BaseContext {
  accID: string,
  name: string,
}

/**
 * Represents custom information stored in the accessory context of a sensor
 */
export interface SensorContext extends BaseContext {
  state: CharacteristicValue,
  batteryLow: boolean,
  /**
   * SensorType is a string which was used pre v1.8.0 to track the sensor type.
   * @deprecated Use the type property for a better representation of the type.
   */
  sensorType: string,
  /**
   * Type refers to the type of sensor as told by the Alarm.com API. The previous property, sensorType, was best-guess
   * and was sometimes reporting the wrong sensor type.
   */
  type: SensorType
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