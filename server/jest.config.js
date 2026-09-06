export default {
  testEnvironment:    'node',
  transform:          {},
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper:   {},
  testMatch:          ['**/tests/**/*.test.js'],
  setupFiles:         ['./tests/setup.js'],
  collectCoverageFrom: ['controllers/**/*.js', 'middleware/**/*.js', 'utils/**/*.js', 'services/**/*.js'],
  coverageReporters:  ['text', 'html'],
};
