/**
 * AI Output Evaluator - Configuration Handler
 * Loads and validates environment variables.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { z } = require('zod');

// Load environment variables from the project root .env
const rootEnvPath = path.join(__dirname, '../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config(); // Fallback to current directory
}

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required for evaluation services.')
});

let parsedConfig;
try {
  parsedConfig = configSchema.parse({
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
  });
} catch (error) {
  console.warn('\n[Evaluator Config] Environment validation issues identified:');
  if (error instanceof z.ZodError) {
    error.errors.forEach(err => {
      console.warn(`  - ${err.path.join('.')}: ${err.message}`);
    });
  }
  // If we are in test mode, we can stub a fake key to pass compile/initial test checks
  if (process.env.NODE_ENV === 'test') {
    console.log('[Evaluator Config] Running in test mode. Injecting stub API key.');
    parsedConfig = {
      PORT: 3000,
      NODE_ENV: 'test',
      GEMINI_API_KEY: 'stub_test_key_placeholder'
    };
  } else {
    console.error('[Evaluator Config] Fatal configuration error. Exiting.');
    process.exit(1);
  }
}

module.exports = parsedConfig;
