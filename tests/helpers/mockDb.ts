export type QueryResult = any[];

type QueueBuckets = {
  select: QueryResult[];
  insert: QueryResult[];
  update: QueryResult[];
  delete: QueryResult[];
};

const buildQuery = (result: QueryResult) => {
  const resolved = Promise.resolve(result);

  const query: any = {
    from: () => query,
    leftJoin: () => query,
    rightJoin: () => query,
    innerJoin: () => query,
    where: () => query,
    limit: () => resolved,
    orderBy: () => query,
    groupBy: () => query,
    returning: () => resolved,
    onConflictDoNothing: () => resolved,
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };

  return query;
};

export const createMockDb = () => {
  const queues: QueueBuckets = {
    select: [],
    insert: [],
    update: [],
    delete: [],
  };

  const next = (bucket: keyof QueueBuckets): QueryResult => {
    return queues[bucket].length ? queues[bucket].shift()! : [];
  };

  const db = {
    queueSelect(result: QueryResult) {
      queues.select.push(result);
    },
    queueInsert(result: QueryResult) {
      queues.insert.push(result);
    },
    queueUpdate(result: QueryResult) {
      queues.update.push(result);
    },
    queueDelete(result: QueryResult) {
      queues.delete.push(result);
    },
    reset() {
      queues.select = [];
      queues.insert = [];
      queues.update = [];
      queues.delete = [];
    },
    select: () => buildQuery(next('select')),
    insert: () => {
      const query = buildQuery(next('insert'));
      return {
        values: () => query,
      };
    },
    update: () => {
      const query = buildQuery(next('update'));
      return {
        set: () => query,
      };
    },
    delete: () => {
      const query = buildQuery(next('delete'));
      return {
        where: () => query,
      };
    },
  };

  return db;
};
