export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(.*)/dist/.*|bullmq|ioredis|@socket.io/redis-adapter)',
  ],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};