/**
 * MSW Node.js server for integration tests.
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

export const server = setupServer(...handlers);
