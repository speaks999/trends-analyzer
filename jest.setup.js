// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Load environment variables from .env.local for integration tests
import { config } from 'dotenv'
config({ path: '.env.local' })

// Polyfill fetch for Node.js environment in tests
if (typeof global.fetch === 'undefined') {
  global.fetch = require('node-fetch')
  global.Headers = require('node-fetch').Headers
  global.Request = require('node-fetch').Request
  global.Response = require('node-fetch').Response
}
