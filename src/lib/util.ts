import {
  TDbBase,
  TDbChangeType
} from './types'

export function applyDelete<TDoc>(
  db: TDbBase<TDoc>,
  collection: string,
  id: string
): boolean {
  const oldDoc = db.get(collection, id)
  if (oldDoc) {
    db.delete(collection, id)
    return true
  }
  return false
}

export function applySet<TDoc>(
  db: TDbBase<TDoc>,
  collection: string,
  doc: TDoc
): boolean {
  const id = db.getId(doc)
  const oldDoc = db.get(collection, id)
  if (!oldDoc || !db.isEqual(doc, oldDoc)) {
    db.set(collection, doc)
    return true
  }
  return false
}

export function applyChange<TDoc>(
  db: TDbBase<TDoc>,
  type: TDbChangeType,
  collection: string,
  doc: TDoc
): boolean {
  if (type === 'delete') {
    return applyDelete(db, collection, db.getId(doc))
  }
  return applySet(db, collection, doc)
}