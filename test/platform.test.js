const { test } = require('node:test');
const assert = require('node:assert/strict');
const frontpoint = require('frontpoint');
async function setup(t, config = {}) {
  const { HomebridgeAPI } = await import('../node_modules/homebridge/dist/api.js');
  const api = new HomebridgeAPI();
  let Platform;
  api.registerPlatform = (id, name, Class) => { Platform = Class; };
  const removed = [];
  api.registerPlatformAccessories = () => {};
  api.unregisterPlatformAccessories = (id, name, accessories) => removed.push(...accessories);
  require('..')(api);
  const logs = [];
  const instance = new Platform(message => logs.push(message), { username: 'fixture', password: 'secret', ...config }, api);
  t.after(() => api.emit('shutdown'));
  return { instance, api, removed, logs };
}
const partition = (state = 1) => ({ id: 'panel', attributes: { description: 'Test Panel', state, desiredState: state } });
const sensor = { id: 'door', attributes: { description: 'Door', state: 1 } };
test('filtering applies to discovery and cached accessories without changing IDs', async t => {
  const { instance, api, removed } = await setup(t, { excludeIDs: ['door'] });
  instance.addPartition(partition()); instance.addSensor(sensor);
  assert.deepEqual(Object.keys(instance.accessories), ['panel']);
  const cached = new api.platformAccessory('Door', api.hap.uuid.generate('door'));
  cached.context = { accID: 'door', name: 'Door', sensorType: 'Contact Sensor' };
  instance.configureAccessory(cached);
  assert.equal(removed[0], cached);
  assert.equal(instance.accessories.panel.UUID, api.hap.uuid.generate('panel'));
});
test('unknown alarm state is unavailable and faulted, never reported disarmed', async t => {
  const { instance, api } = await setup(t);
  instance.addPartition(partition(0));
  const accessory = instance.accessories.panel, service = accessory.getService(api.hap.Service.SecuritySystem);
  assert.equal(accessory.context.state, undefined);
  await assert.rejects(service.getCharacteristic(api.hap.Characteristic.SecuritySystemCurrentState).handleGetRequest());
  assert.equal(service.getCharacteristic(api.hap.Characteristic.StatusFault).value, 1);
  instance.setPartitionState(accessory, partition());
  assert.equal(accessory.context.state, api.hap.Characteristic.SecuritySystemCurrentState.DISARMED);
});
test('coalesces login and refresh, removes stale accessories only after successful listing', async t => {
  const { instance } = await setup(t);
  let loginCount = 0, stateCount = 0, release;
  const gate = new Promise(resolve => release = resolve);
  t.mock.method(frontpoint, 'login', async () => { loginCount++; await gate; return { systems: ['system'] }; });
  t.mock.method(frontpoint, 'getCurrentState', async () => { stateCount++; return { partitions: [partition()], sensors: [] }; });
  const first = instance.refreshDevices(), second = instance.refreshDevices();
  release(); await Promise.all([first, second]);
  assert.equal(loginCount, 1); assert.equal(stateCount, 1);
  assert.ok(instance.accessories.panel);
  t.mock.method(frontpoint, 'getCurrentState', async () => { throw new Error('sensitive response'); });
  await instance.refreshDevices(); assert.ok(instance.accessories.panel);
});
test('removing all accessories works with object storage', async t => {
  const { instance, removed } = await setup(t);
  instance.addPartition(partition()); instance.addSensor(sensor);
  instance.removeAccessories(); assert.equal(removed.length, 2); assert.equal(Object.keys(instance.accessories).length, 0);
});
test('shutdown prevents late discovery and clears polling', async t => {
  const { instance, api } = await setup(t);
  let release;
  instance.listDevices = () => new Promise(resolve => release = resolve);
  instance.didFinishLaunching(); api.emit('shutdown');
  release({ partitions: [partition()], sensors: [sensor] });
  await instance.refreshPromise;
  assert.equal(Object.keys(instance.accessories).length, 0);
  assert.equal(instance.timerID._destroyed, true);
});
test('commands await the cloud outcome and sanitize errors without optimistic alarm state', async t => {
  const { instance, api, logs } = await setup(t);
  instance.addPartition(partition());
  instance.login = async () => ({});
  instance.refreshDevices = async () => {};
  let release;
  t.mock.method(frontpoint, 'armAway', () => new Promise((resolve, reject) => release = reject));
  let calls = 0, error;
  instance.changePartitionState(instance.accessories.panel, api.hap.Characteristic.SecuritySystemTargetState.AWAY_ARM, err => { calls++; error = err; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(instance.accessories.panel.context.desiredState, api.hap.Characteristic.SecuritySystemTargetState.DISARM);
  release(new Error('token=secret'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(error.message, 'FrontPoint command failed');
  assert.doesNotMatch(logs.join('\n'), /token=secret/);
});
test('validates refresh and accessory filter settings', async t => {
  for (const config of [{ refreshSeconds: 0 }, { includeIDs: 'door' }, { armingModes: { unknown: {} } }]) await assert.rejects(setup(t, config));
});
