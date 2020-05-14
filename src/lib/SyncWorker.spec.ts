import test from 'ava'
import sinon from 'sinon'
import { Patch, applyPatches, enablePatches } from 'immer'
import SyncWorker from './SyncWorker'
import { ServerMemoryDb, WorkerMemoryDb } from './MemoryDb'
import { TObj, TWorkerDb , TServerDb } from './types'

enablePatches()

function createSyncWorker(addListener = true): SyncWorker<string, TObj, string, string, Patch> {
  return new SyncWorker(
    new WorkerMemoryDb(),
    new ServerMemoryDb(),
    applyPatches,
    addListener
  )
}

test.beforeEach(t => {
  t.context = createSyncWorker()
})

test('clientChanged delete: should delete doc from db', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'i1' })
  const spy = sinon.spy()
  // @ts-ignore
  syncWorker.workerDb.delete = spy
  syncWorker.clientChanged([
    { id: 'o1', type: 'delete', collection: 'c1', doc: { id: 'i1' } }
  ])
  // @ts-ignore
  t.deepEqual(Array.from(syncWorker.clientChanges.values()), [
    {
      id: 'o1',
      type: 'delete',
      collection: 'c1',
      doc: { id: 'i1' }
    }
  ])
  t.assert(spy.calledWith('c1', 'i1'))
})

test('clientChanged upsert: when db has doc then upsert db doc and emit changed event if change.doc !== db.doc', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const changedListenerSpy = sinon.spy()
  syncWorker.addListener('changed', changedListenerSpy)
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'i1', name: 'Name1', other: 'Other' })
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'i2', name: 'Name1' })
  const spy = sinon.spy()
  // @ts-ignore
  syncWorker.workerDb.set = spy
  syncWorker.clientChanged([
    {
      id: 'o1',
      type: 'upsert',
      collection: 'c1',
      doc: { id: 'i1', name: 'Name2' },
      patches: [{ op: 'replace', path: ['name'], value: 'Name2' }]
    },
    {
      id: 'o2',
      type: 'upsert',
      collection: 'c1',
      doc: { id: 'i2', name: 'Name2' },
      patches: [{ op: 'replace', path: ['name'], value: 'Name2' }]
    },
    {
      id: 'o3',
      type: 'upsert',
      collection: 'c1',
      doc: { id: 'i2', name: 'Name3' },
      patches: [{ op: 'replace', path: ['name'], value: 'Name3' }]
    }
  ])
  t.assert(spy.calledWith('c1', { id: 'i1', name: 'Name2', other: 'Other' }))
  t.deepEqual(changedListenerSpy.getCall(0).args, [
    [{
      id: 'o1',
      type: 'set',
      collection: 'c1',
      doc: { id: 'i1', name: 'Name2', other: 'Other' }
    }]
  ])
  // @ts-ignore
  t.deepEqual(Array.from(syncWorker.clientChanges.values()), [
    {
      id: 'o1',
      type: 'upsert',
      collection: 'c1',
      doc: { id: 'i1', name: 'Name2' },
      patches: [{ op: 'replace', path: ['name'], value: 'Name2' }]
    },
    {
      id: 'o3',
      type: 'upsert',
      collection: 'c1',
      doc: { id: 'i2', name: 'Name3' },
      patches: [
        { op: 'replace', path: ['name'], value: 'Name2' },
        { op: 'replace', path: ['name'], value: 'Name3' }
      ]
    }
  ])
})

test('clientChanged upsert: when db does not have doc then set db in doc', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const spy = sinon.spy()
  // @ts-ignore
  syncWorker.workerDb.set = spy
  syncWorker.clientChanged([
    {
      id: 'o1',
      type: 'upsert',
      collection: 'c1',
      doc: { id: 'i1', name: 'Name2' },
      patches: [{ op: 'replace', path: ['name'], value: 'Name2' }]
    }
  ])
  t.assert(spy.calledWith('c1', { id: 'i1', name: 'Name2' }))
})

test('changed: when there is no clientChange for doc id then apply serverChange to db and emit changed event', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const emitSpy = sinon.spy()
  syncWorker.addListener('changed', emitSpy)
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'id2' })
  // @ts-ignore
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  // @ts-ignore
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
  // @ts-ignore
  syncWorker.changed([
    {
      type: 'set',
      collection: 'c1',
      doc: { id: 'id1' }
    }, {
      type: 'set',
      collection: 'c1',
      doc: { id: 'id2' }
    }, {
      type: 'delete',
      collection: 'c1',
      doc: { id: 'id2' }
    },
    {
      type: 'delete',
      collection: 'c1',
      doc: { id: 'id3' }
    }
  ])
  t.assert(setSpy.calledWith('c1', { id: 'id1' }))
  t.assert(deleteSpy.calledWith('c1', 'id2'))
  t.deepEqual(emitSpy.getCall(0).args, [[
    {
      type: 'set',
      collection: 'c1',
      doc: { id: 'id1' }
    }, {
      type: 'delete',
      collection: 'c1',
      doc: { id: 'id2' }
    }
  ]])
})

test('changed: delete clientChange -> do nothing', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const emitSpy = sinon.spy()
  syncWorker.addListener('changed', emitSpy)
  // @ts-ignore
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  // @ts-ignore
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
  // @ts-ignore
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'delete', collection: 'c1', doc: { id: 'id1' } })
  // @ts-ignore
  syncWorker.clientChanges.set('id2', { id: 'o2', type: 'delete', collection: 'c1', doc: { id: 'id2' } })
  // @ts-ignore
  syncWorker.changed([
    {
      type: 'set',
      collection: 'c1',
      doc: { id: 'id1' }
    }, {
      type: 'delete',
      collection: 'c1',
      doc: { id: 'id2' }
    }
  ])
  t.assert(setSpy.notCalled)
  t.assert(deleteSpy.notCalled)
  t.assert(emitSpy.notCalled)
})

/*
test('changed: set clientChange and delete serverChange -> delete doc and emit changed', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'id1' })
  // @ts-ignore
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1' }, patches: [] })
  const emitSpy = sinon.spy()
  syncWorker.addListener('changed', emitSpy)
  // @ts-ignore
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  // @ts-ignore
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
  // @ts-ignore
  syncWorker.changed([
    {
      type: 'delete',
      collection: 'c1',
      doc: { id: 'id1' }
    }
  ])
  t.assert(setSpy.notCalled)
  t.assert(deleteSpy.calledWith('c1', 'id1'))
  t.deepEqual(emitSpy.getCall(0).args, [[
    {
      id: 'o1',
      type: 'delete',
      collection: 'c1',
      doc: { id: 'id1' }
    }
  ]])
})

test('changed: set clientChange and delete serverChange -> do not emit changed unless doc exists', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  // @ts-ignore
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1' }, patches: [] })
  const emitSpy = sinon.spy()
  syncWorker.addListener('changed', emitSpy)
  // @ts-ignore
  syncWorker.changed([
    {
      type: 'delete',
      collection: 'c1',
      doc: { id: 'id1' }
    }
  ])
  t.assert(emitSpy.notCalled)
})
*/

test('changed: set clientChange and set serverChange -> set server doc updated with clientChange patches and emit changed', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'id1', name: 'clientName' })
  // @ts-ignore
  syncWorker.clientChanges.set('id1', {
    id: 'o1',
    type: 'upsert',
    collection: 'c1',
    doc: { id: 'id1', name: 'clientName' },
    patches: [{
      op: 'add',
      path: ['name'],
      value: 'clientName'
    }]
  })
  const emitSpy = sinon.spy()
  syncWorker.addListener('changed', emitSpy)
  // @ts-ignore
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  // @ts-ignore
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
  // @ts-ignore
  syncWorker.changed([
    {
      type: 'set',
      collection: 'c1',
      doc: { id: 'id1', name: 'serverName', other: 'otherName' }
    }
  ])
  t.assert(setSpy.calledWith('c1', { id: 'id1', name: 'clientName', other: 'otherName' }))
  t.assert(deleteSpy.notCalled)
  t.deepEqual(emitSpy.getCall(0).args, [[
    {
      id: 'o1',
      type: 'set',
      collection: 'c1',
      doc: { id: 'id1', name: 'clientName', other: 'otherName' }
    }
  ]])
})

test('changed: set clientChange and set serverChange -> do not emit unless patched server doc != clientChange doc', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'id1', name: 'clientName', other: 'otherName' })
  // @ts-ignore
  syncWorker.clientChanges.set('id1', {
    id: 'o1',
    type: 'upsert',
    collection: 'c1',
    doc: { id: 'id1', name: 'clientName', other: 'otherName' },
    patches: [{
      op: 'add',
      path: ['name'],
      value: 'clientName'
    }]
  })
  const emitSpy = sinon.spy()
  syncWorker.addListener('changed', emitSpy)
  // @ts-ignore
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  // @ts-ignore
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
  // @ts-ignore
  syncWorker.changed([
    {
      type: 'set',
      collection: 'c1',
      doc: { id: 'id1', name: 'serverName', other: 'otherName' }
    }
  ])
  t.assert(setSpy.notCalled)
  t.assert(deleteSpy.notCalled)
  t.assert(emitSpy.notCalled)
})

test('save: throw when worker db.save throws', async t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  // @ts-ignore
  syncWorker.workerDb.save = () => Promise.reject(new Error('Error saving'))
  try {
    await syncWorker.save()
    t.fail()
  } catch (err) {
    t.assert(err.message === 'Error saving')
    // @ts-ignore
    t.is(syncWorker.pendingClientChanges, null)
    // @ts-ignore
    t.is(syncWorker.pendingServerChanges, null)
  }
})

test('save: convert clientChanges to dbChanges -> with db doc, clientChange patches -> clears clientChanges', async t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const spy = sinon.spy()
  // @ts-ignore
  syncWorker.serverDb.save = spy
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'id1', name: 'NoName', other: 'serverName' })
  // @ts-ignore
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] })
  // @ts-ignore
  syncWorker.clientChanges.set('id2', { id: 'o2', type: 'delete', collection: 'c1', doc: { id: 'id2' } })
  // @ts-ignore
  t.is(syncWorker.clientChanges.size, 2)
  await syncWorker.save()
  t.deepEqual(spy.getCall(0).args, [[
    { type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName', other: 'serverName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] },
    { type: 'delete', collection: 'c1', doc: { id: 'id2' } }
  ]])
  // @ts-ignore
  t.is(syncWorker.clientChanges.size, 0)
})

test('save: buffers incoming changes while saving and processes buffered changes after saving', async t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const spy = sinon.spy(() => new Promise(resolve => {
    // @ts-ignore
    syncWorker.changed([{ type: 'set', collection: 'c1', doc: { id: 'id1' } }])
    syncWorker.clientChanged([{ id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id2' }, patches: [] }])
    resolve()
  }))
  // @ts-ignore
  syncWorker.serverDb.save = spy as any
  await syncWorker.save()
  t.deepEqual(spy.getCall(0).args, [[]])
  // @ts-ignore
  t.deepEqual(syncWorker.workerDb.get('c1', 'id1'), { id: 'id1' })
  // @ts-ignore
  t.deepEqual(Array.from(syncWorker.clientChanges.values()), [
    { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id2' }, patches: [] }
  ])
  // @ts-ignore
  t.is(syncWorker.pendingClientChanges, null)
  // @ts-ignore
  t.is(syncWorker.pendingServerChanges, null)
})

test('save: buffers incoming changes and retains old changes when savingChanges throws', async t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const spy = sinon.spy(() => new Promise((_, reject) => {
    // @ts-ignore
    syncWorker.changed([{ type: 'set', collection: 'c1', doc: { id: 'id3' } }])
    syncWorker.clientChanged([{ id: 'o3', type: 'upsert', collection: 'c1', doc: { id: 'id4' }, patches: [] }])
    reject()
  }))
  // @ts-ignore
  syncWorker.serverDb.save = spy as any
  // @ts-ignore
  syncWorker.workerDb.set('c1', { id: 'id1', name: 'NoName', other: 'serverName' })
  // @ts-ignore
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] })
  // @ts-ignore
  syncWorker.clientChanges.set('id2', { id: 'o2', type: 'delete', collection: 'c1', doc: { id: 'id2' } })
  try {
    await syncWorker.save()
    t.fail()
  } catch(err) {
    t.deepEqual(spy.getCall(0).args, [[
      { type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName', other: 'serverName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] },
      { type: 'delete', collection: 'c1', doc: { id: 'id2' } }
    ]])  
    // @ts-ignore
    t.deepEqual(syncWorker.workerDb.get('c1', 'id1'), { id: 'id1', name: 'NoName', other: 'serverName' })
    // @ts-ignore
    t.deepEqual(syncWorker.workerDb.get('c1', 'id3'), { id: 'id3' })
    // @ts-ignore
    t.deepEqual(Array.from(syncWorker.clientChanges.values()), [
      { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] },
      { id: 'o2', type: 'delete', collection: 'c1', doc: { id: 'id2' } },
      { id: 'o3', type: 'upsert', collection: 'c1', doc: { id: 'id4' }, patches: [] }
    ])
    // @ts-ignore
    t.is(syncWorker.pendingClientChanges, null)
    // @ts-ignore
    t.is(syncWorker.pendingServerChanges, null)  
  }
})

test('constructor should not add listener when addListener param is false', t => {
  const syncWorker = createSyncWorker(false)
  const spy = sinon.spy()
  // @ts-ignore
  syncWorker.changed = spy
  // @ts-ignore
  syncWorker.serverDb.set('c1', { id: 'id1' })
  t.assert(spy.notCalled)
})

test('compact event: should delete alls doc in worker that are not in the listed ids for the given collection and not changed by client', t => {
  const syncWorker = createSyncWorker(true)
  // @ts-ignore
  const serverDb: TServerDb<string, any, any> = syncWorker.serverDb
  // @ts-ignore
  const workerDb: TWorkerDb<string, any, string> = syncWorker.workerDb
  workerDb.set('c1', { id: 'id1' })
  workerDb.set('c1', { id: 'id2' })
  workerDb.set('c1', { id: 'id3' })
  workerDb.set('c2', { id: 'id4' })
  syncWorker.clientChanged([{ type: 'upsert', id: 'o1', collection: 'c1', doc: { id: 'id1' }, patches: [] }])
  t.deepEqual(workerDb.ids('c1'), ['id1', 'id2', 'id3'])
  // @ts-ignore
  serverDb.emit('compact', 'c1', ['id3'])
  t.deepEqual(workerDb.ids('c1'), ['id1', 'id3'])
})