import { startGlobalContainer, stopGlobalContainer } from '../test-utils/testcontainer-db.js';

export async function setup() {
  console.log('Starting Global TestContainer...');
  const uri = await startGlobalContainer();

  process.env.TEST_DB_URL = uri;

  return async () => {
    console.log('Stopping Global TestContainer...');
    await stopGlobalContainer();
  };
}
