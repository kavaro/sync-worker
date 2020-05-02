import test from 'ava'
import sinon from 'sinon'
import { Patch, applyPatches, enablePatches } from 'immer'
import SyncWorker from './SyncWorker'
import { WorkerMemoryDb, ServerMemoryDb } from './MemoryDb'
import { TObj } from './types'

enablePatches()

function createSyncWorker() {
  return new SyncWorker(
    new WorkerMemoryDb(),
    new ServerMemoryDb(),
    applyPatches
  )
}

test.beforeEach(t => {
  t.context = createSyncWorker()
})

test('clientChanged delete: should delete doc from db', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  syncWorker.workerDb.set('c1', { id: 'i1' })
  const spy = sinon.spy()
  syncWorker.workerDb.delete = spy
  syncWorker.clientChanged([
    { id: 'o1', type: 'delete', collection: 'c1', doc: { id: 'i1' } }
  ])
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
  syncWorker.workerDb.set('c1', { id: 'i1', name: 'Name1', other: 'Other' })
  syncWorker.workerDb.set('c1', { id: 'i2', name: 'Name1' })
  const spy = sinon.spy()
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
  syncWorker.workerDb.set('c1', { id: 'id2' })
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
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
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'delete', collection: 'c1', doc: { id: 'id1' } })
  syncWorker.clientChanges.set('id2', { id: 'o2', type: 'delete', collection: 'c1', doc: { id: 'id2' } })
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

test('changed: set clientChange and delete serverChange -> delete doc and emit changed', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  syncWorker.workerDb.set('c1', { id: 'id1' })
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1' }, patches: [] })
  const emitSpy = sinon.spy()
  syncWorker.addListener('changed', emitSpy)
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
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
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1' }, patches: [] })
  const emitSpy = sinon.spy()
  syncWorker.addListener('changed', emitSpy)
  syncWorker.changed([
    {
      type: 'delete',
      collection: 'c1',
      doc: { id: 'id1' }
    }
  ])
  t.assert(emitSpy.notCalled)
})

test('changed: set clientChange and set serverChange -> set server doc updated with clientChange patches and emit changed', t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  syncWorker.workerDb.set('c1', { id: 'id1', name: 'clientName' })
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
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
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
  syncWorker.workerDb.set('c1', { id: 'id1', name: 'clientName', other: 'otherName' })
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
  const setSpy = sinon.spy(syncWorker.workerDb, 'set')
  const deleteSpy = sinon.spy(syncWorker.workerDb, 'delete')
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
  syncWorker.workerDb.save = () => Promise.reject(new Error('Error saving'))
  try {
    await syncWorker.save()
    t.fail()
  } catch (err) {
    t.assert(err.message == 'Error saving')
    t.is(syncWorker.pendingClientChanges, null)
    t.is(syncWorker.pendingServerChanges, null)
  }
})

test('save: convert clientChanges to dbChanges -> with db doc, clientChange patches -> clears clientChanges', async t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const spy = sinon.spy()
  syncWorker.serverDb.save = spy
  syncWorker.workerDb.set('c1', { id: 'id1', name: 'NoName', other: 'serverName' })
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] })
  syncWorker.clientChanges.set('id2', { id: 'o2', type: 'delete', collection: 'c1', doc: { id: 'id2' } })
  t.is(syncWorker.clientChanges.size, 2)
  await syncWorker.save()
  t.deepEqual(spy.getCall(0).args, [[
    { type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName', other: 'serverName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] },
    { type: 'delete', collection: 'c1', doc: { id: 'id2' } }
  ]])
  t.is(syncWorker.clientChanges.size, 0)
})

test('save: buffers incoming changes while saving and processes buffered changes after saving', async t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const spy = sinon.spy(() => new Promise(resolve => {
    syncWorker.changed([{ type: 'set', collection: 'c1', doc: { id: 'id1' } }])
    syncWorker.clientChanged([{ id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id2' }, patches: [] }])
    resolve()
  }))
  syncWorker.serverDb.save = spy as any
  await syncWorker.save()
  t.deepEqual(spy.getCall(0).args, [[]])
  t.deepEqual(syncWorker.workerDb.get('c1', 'id1'), { id: 'id1' })
  t.deepEqual(Array.from(syncWorker.clientChanges.values()), [
    { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id2' }, patches: [] }
  ])
  t.is(syncWorker.pendingClientChanges, null)
  t.is(syncWorker.pendingServerChanges, null)
})

test('save: buffers incoming changes and retains old changes when savingChanges throws', async t => {
  const syncWorker = t.context as SyncWorker<string, TObj, string, string, Patch>
  const spy = sinon.spy(() => new Promise((_, reject) => {
    syncWorker.changed([{ type: 'set', collection: 'c1', doc: { id: 'id3' } }])
    syncWorker.clientChanged([{ id: 'o3', type: 'upsert', collection: 'c1', doc: { id: 'id4' }, patches: [] }])
    reject()
  }))
  syncWorker.serverDb.save = spy as any
  syncWorker.workerDb.set('c1', { id: 'id1', name: 'NoName', other: 'serverName' })
  syncWorker.clientChanges.set('id1', { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] })
  syncWorker.clientChanges.set('id2', { id: 'o2', type: 'delete', collection: 'c1', doc: { id: 'id2' } })
  try {
    await syncWorker.save()
    t.fail()
  } catch(err) {
    t.deepEqual(spy.getCall(0).args, [[
      { type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName', other: 'serverName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] },
      { type: 'delete', collection: 'c1', doc: { id: 'id2' } }
    ]])  
    t.deepEqual(syncWorker.workerDb.get('c1', 'id1'), { id: 'id1', name: 'NoName', other: 'serverName' })
    t.deepEqual(syncWorker.workerDb.get('c1', 'id3'), { id: 'id3' })
    t.deepEqual(Array.from(syncWorker.clientChanges.values()), [
      { id: 'o1', type: 'upsert', collection: 'c1', doc: { id: 'id1', name: 'NoName' }, patches: [{ op: 'add', path: ['name'], value: 'NoName' }] },
      { id: 'o2', type: 'delete', collection: 'c1', doc: { id: 'id2' } },
      { id: 'o3', type: 'upsert', collection: 'c1', doc: { id: 'id4' }, patches: [] }
    ])
    t.is(syncWorker.pendingClientChanges, null)
    t.is(syncWorker.pendingServerChanges, null)  
  }
})