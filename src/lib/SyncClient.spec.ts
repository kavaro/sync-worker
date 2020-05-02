import test from 'ava'
import sinon from 'sinon'
import { Patch } from 'immer'
import SyncClient from './SyncClient'
import { ClientMemoryDb } from './MemoryDb'
import { TObj } from './types'

function createSyncClient(...ids: string[]) {
  const db = new ClientMemoryDb()
  const idFactory = () => ids.shift()
  return new SyncClient(db, idFactory, false)
}

test.beforeEach(t => {
  t.context = createSyncClient('a', 'b', 'c')
})

test('changed should generate change id and emit changed event', t => {
  const client = t.context as SyncClient<string, TObj, string, string, Patch>
  const changedListener = sinon.spy()
  client.addListener('changed', changedListener)
  client.changed([{
    type: 'upsert',
    collection: 'c1',
    doc: { id: 'i1', name: 'n1' },
    patches: []
  }])
  t.assert(changedListener.calledWith([{
    id: 'a',
    type: 'upsert',
    collection: 'c1',
    doc: { id: 'i1', name: 'n1' },
    patches: []
  }]))
})

test('workerChanged should call set when doc does not exist', t => {
  const client = t.context as SyncClient<string, TObj, string, string, Patch>
  const spy = client.db.set = sinon.spy()
  client.workerChanged([{ type: 'set', collection: 'c1', doc: { id: 'i1' } }])
  t.assert(spy.calledWith('c1', { id: 'i1' }))
})

test('workerChanged should call set when docs are not equal', t => {
  const client = t.context as SyncClient<string, TObj, string, string, Patch>
  client.db.set('c1', { id: 'i1' })
  const spy = client.db.set = sinon.spy()
  client.workerChanged([{ type: 'set', collection: 'c1', doc: { id: 'i1', name: 'NoName' } }])
  t.assert(spy.calledWith('c1', { id: 'i1', name: 'NoName' }))
})

test('workerChanged should not call set when docs are equal', t => {
  const client = t.context as SyncClient<string, TObj, string, string, Patch>
  client.db.set('c1', { id: 'i1' })
  const spy = client.db.set = sinon.spy()
  client.workerChanged([{ type: 'set', collection: 'c1', doc: { id: 'i1' } }])
  t.assert(spy.notCalled)
})

test('workerChanged should call delete when doc exists', t => {
  const client = t.context as SyncClient<string, TObj, string, string, Patch>
  client.db.set('c1', { id: 'i1' })
  const spy = client.db.delete = sinon.spy()
  client.workerChanged([{ type: 'delete', collection: 'c1', doc: { id: 'i1' } }])
  t.assert(spy.calledWith('c1', 'i1'))
})

test('workerChanged should not call delete when doc does not exists', t => {
  const client = t.context as SyncClient<string, TObj, string, string, Patch>
  const spy = client.db.delete = sinon.spy()
  client.workerChanged([{ type: 'delete', collection: 'c1', doc: { id: 'i1' } }])
  t.assert(spy.notCalled)
})

test('workerChanged should clear optimistic change when change id matches', t => {
  const client = t.context as SyncClient<string, TObj, string, string, Patch>
  client.changed([{
    type: 'delete',
    collection: 'c1',
    doc: { id: 'i1' }
  }, {
    type: 'upsert',
    collection: 'c2',
    doc: { id: 'i2' },
    patches: []
  }])
  client.workerChanged([{
    id: 'a',
    type: 'set',
    collection: 'c1',
    doc: { id: 'i1' }
  }, {
    id: 'c',
    type: 'delete',
    collection: 'c2',
    doc: { id: 'i2' }
  }])
  t.deepEqual(Array.from(client.optimisticChangeIds.ids.values()), ['b'])
})

test('should not emit changed events while applying worker changes', t => {
  const client = t.context as SyncClient<string, TObj, string, string, Patch>
  const changedCalledSpy = sinon.spy()
  const oldSet = client.db.set
  client.db.set = function (collection, doc) {
    const result = oldSet.call(this, collection, doc)
    changedCalledSpy()
    client.changed([{ type: 'upsert', collection, doc, patches: [] }])
    return result
  }
  const changedListenerSpy = sinon.spy()
  client.addListener('changed', changedListenerSpy)
  client.workerChanged([{
    id: 'a',
    type: 'set',
    collection: 'c1',
    doc: { id: 'i1' }
  }])
  t.assert(changedCalledSpy.called)
  t.assert(changedListenerSpy.notCalled)
})
