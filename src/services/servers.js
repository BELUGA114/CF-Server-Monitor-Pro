import { insertServer } from '../db/servers.js';

export async function addServer(db, name, agentOs) {
  const id = crypto.randomUUID();
  await insertServer(db, id, name, agentOs);
  return id;
}
