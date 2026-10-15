import { defineConfig } from 'vitest/config';
export default defineConfig({server:{proxy:{'/api':'http://127.0.0.1:5080'}},test:{environment:'jsdom',include:['src/**/*.test.tsx']}});
