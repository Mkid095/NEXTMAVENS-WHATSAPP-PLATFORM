module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
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
  testPathIgnorePatterns: [
    'node_modules',
    '.nvm',
    'hack-free-web',
    'nextmavens-email',
  ],
  modulePathIgnorePatterns: [
    'node_modules',
    '.nvm',
    'hack-free-web',
    'nextmavens-email',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(.*)/dist/.*|bullmq|ioredis|@socket.io/redis-adapter)',
  ],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  maxWorkers: 1,
};