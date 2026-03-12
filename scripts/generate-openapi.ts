import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/app.js';
import { openApiConfig } from '../src/lib/openapi-config.js';

const openApiSpec = app.getOpenAPIDocument(openApiConfig);

const outputPath = path.resolve(process.cwd(), 'openapi.json');

fs.writeFileSync(outputPath, JSON.stringify(openApiSpec, null, 2));

console.log(`✅ OpenAPI spec generated at ${outputPath}`);
