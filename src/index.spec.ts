import test from 'ava'
import { applyPatches, Patch } from 'immer'
import { v4 as uuid } from 'uuid'
import { 
  ClientMemoryDb, 
  ServerMemoryDb, 
  SyncClient, 
  SyncWorker, 
  TObj,
  WorkerMemoryDb
} from '.'

class MockWorkerChannel {
  public name: string
  public onchange: any = null
  public Q: any[] = []
  private enabled: boolean = true

  constructor(name: string, onchange: any) {
    this.name = name
    this.onchange = onchange
  }

  public postMessage(msg: any): void {
    this.Q.push(msg)
    if (this.isEnabled()) {
      this.next()
    }
  }

  public next(count: number = Number.MAX_SAFE_INTEGER): void {
    while (count && this.Q.length) {
      this.onchange(this.Q.shift())
      count--
    }
  }

  public disable(): MockWorkerChannel {
    this.enabled = false
    return this
  }

  public enable(): MockWorkerChannel {
    this.enabled = true
    return this
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public size(): number {
    return this.Q.length
  }

  public isEmpty(): boolean {
    return !this.Q.length
  }
}

test.beforeEach(t => {
  // client
  const clientDb = new ClientMemoryDb()
  const syncClient = new SyncClient<string, TObj, string, string, Patch>(clientDb, uuid)
  // worker and server 
  const workerDb = new WorkerMemoryDb()
  const serverDb = new ServerMemoryDb()
  const syncWorker = new SyncWorker<string, TObj, string, string, Patch>(workerDb, serverDb, applyPatches)
  // bind async communication channels
  const client2worker = new MockWorkerChannel('client2worker', message => syncWorker[message.type](message.payload))
  const worker2client = new MockWorkerChannel('worker2client', message => syncClient[message.type](message.payload))
  syncClient.addListener('changed', changes => client2worker.postMessage({ type: 'clientChanged', payload: changes }))
  syncWorker.addListener('changed', changes => worker2client.postMessage({ type: 'workerChanged', payload: changes }))
  t.context = {
    clientDb,
    syncClient,
    client2worker,
    worker2client,
    syncWorker,
    serverDb,
    save: async () => {
      await syncWorker.save()
      let resolveSave = null
      new Promise(resolve => resolveSave = resolve)
      return resolveSave
    }
  }
})

test('integration: clientDb.set -> serverDb.set', async t => {
  const { clientDb, serverDb, save } = t.context as any
  clientDb.set('c1', { id: 'id1', name: 'NoName' })
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'NoName' })
})

test('integration: clientDb.delete -> serverDb.delete', async t => {
  const { clientDb, serverDb, save } = t.context as any
  clientDb.set('c1', { id: 'ida', name: 'NoName' })
  clientDb.delete('c1', 'ida')
  const resolveSave = await save()
  resolveSave()
  t.is(serverDb.get('c1', 'ida'), undefined)
})

test('integration: serverDb.set -> clientDb.set', async t => {
  const { clientDb, serverDb } = t.context as any
  serverDb.set('c1', { id: 'id1' })
  t.deepEqual(clientDb.get('c1', 'id1'), { id: 'id1' })
})

test('integration: serverDb.delete -> clientDb.delete', async t => {
  const { clientDb, serverDb } = t.context as any
  serverDb.set('c1', { id: 'id1' })
  serverDb.delete('c1', 'id1')
  t.deepEqual(clientDb.get('c1', 'id1'), undefined)
})

test('integration: clientDb.set + serverDb.set -> clientDb.set (client patches win)', async t => {
  const { clientDb, serverDb, save } = t.context as any
  clientDb.set('c1', { id: 'id1', name: 'a' })
  serverDb.set('c1', { id: 'id1', name: 'b', other: 'c' })
  t.deepEqual(clientDb.get('c1', 'id1'), { id: 'id1', name: 'a', other: 'c' })
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'b', other: 'c' })
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'a', other: 'c' })
})

test('integration: clientDb.set + serverDb.delete -> clientDb.set wins', async t => {
  const { clientDb, serverDb, save } = t.context as any
  clientDb.set('c1', { id: 'id1', name: 'a' })
  serverDb.delete('c1', 'id1')
  t.deepEqual(clientDb.get('c1', 'id1'), { id: 'id1', name: 'a' })
  t.deepEqual(serverDb.get('c1', 'id1'), undefined)
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'a' })
})

test('integration: clientDb.delete + serverDb.set = clientDb.delete wins', async t => {
  const { clientDb, serverDb, save } = t.context as any
  clientDb.set('c1', { id: 'id1', name: 'a' })
  clientDb.delete('c1', 'id1')
  serverDb.set('c1', { id: 'id1', name: 'b', other: 'c' })
  t.deepEqual(clientDb.get('c1', 'id1'), undefined)
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'b', other: 'c' })
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), undefined)
})

test('integration: clientDb.delete + serverDb.delete = clientDb.delete wins', async t => {
  const { clientDb, serverDb, save } = t.context as any
  clientDb.set('c1', { id: 'id1', name: 'a' })
  clientDb.delete('c1', 'id1')
  serverDb.set('c1', { id: 'id1', name: 'b', other: 'c' })
  serverDb.delete('c1', 'id1')
  t.deepEqual(clientDb.get('c1', 'id1'), undefined)
  t.deepEqual(serverDb.get('c1', 'id1'), undefined)
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), undefined)
})

test('integration: clientDb.set concurrent serverDb.set -> clientDb.set (client patches win)', async t => {
  const { clientDb, serverDb, save, client2worker } = t.context as any
  clientDb.set('c1', { id: 'id1', name: 'a0' })
  client2worker.disable()
  clientDb.set('c1', { id: 'id1', name: 'a1' })
  serverDb.set('c1', { id: 'id1', name: 'b', other: 'c' })
  t.is(client2worker.size(), 1)
  t.deepEqual(clientDb.get('c1', 'id1'), { id: 'id1', name: 'a1' })
  client2worker.enable().next()
  t.deepEqual(clientDb.get('c1', 'id1'), { id: 'id1', name: 'a1', other: 'c' })
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'b', other: 'c' })
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'a1', other: 'c' })
})

test('integration: clientDb.set concurrent serverDb.delete -> clientDb.set (client patches win)', async t => {
  const { clientDb, serverDb, save, client2worker } = t.context as any
  clientDb.set('c1', { id: 'id1', name: 'a0' })
  client2worker.disable()
  clientDb.set('c1', { id: 'id1', name: 'a1' })
  serverDb.delete('c1', 'id1')
  t.is(client2worker.size(), 1)
  t.deepEqual(clientDb.get('c1', 'id1'), { id: 'id1', name: 'a1' })
  client2worker.enable().next()
  t.deepEqual(clientDb.get('c1', 'id1'), { id: 'id1', name: 'a1' })
  t.deepEqual(serverDb.get('c1', 'id1'), undefined)
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'a1' })
})

test('integration: clientDb.delete concurrent serverDb.set -> clientDb.delete', async t => {
  const { clientDb, serverDb, save, client2worker } = t.context as any
  clientDb.set('c1', { id: 'id1', name: 'a' })
  client2worker.disable()
  clientDb.delete('c1', 'id1')
  serverDb.set('c1', { id: 'id1', name: 'b', other: 'c' })
  t.is(client2worker.size(), 1)
  t.deepEqual(clientDb.get('c1', 'id1'), undefined)
  client2worker.enable().next()
  t.deepEqual(clientDb.get('c1', 'id1'), undefined)
  t.deepEqual(serverDb.get('c1', 'id1'), { id: 'id1', name: 'b', other: 'c' })
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), undefined)
})

test('integration: clientDb.delete concurrent serverDb.delete -> clientDb.delete', async t => {
  const { clientDb, serverDb, save, client2worker } = t.context as any
  serverDb.set('c1', { id: 'id1', other: 'o' })
  clientDb.set('c1', { id: 'id1', name: 'a' })
  t.deepEqual(clientDb.get('c1', 'id1'), { id: 'id1', name: 'a', other: 'o' })
  client2worker.disable()
  clientDb.delete('c1', 'id1')
  serverDb.delete('c1', 'id1')
  t.is(client2worker.size(), 1)
  t.deepEqual(clientDb.get('c1', 'id1'), undefined)
  client2worker.enable().next()
  t.deepEqual(clientDb.get('c1', 'id1'), undefined)
  t.deepEqual(serverDb.get('c1', 'id1'), undefined)
  const resolveSave = await save()
  resolveSave()
  t.deepEqual(serverDb.get('c1', 'id1'), undefined)
})
