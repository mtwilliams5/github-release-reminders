import { loadConfig } from './config';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should throw when REPOSITORIES is not set', () => {
    delete process.env.REPOSITORIES;
    expect(() => loadConfig()).toThrow(
      'REPOSITORIES environment variable is required',
    );
  });

  it('should parse comma-separated repositories', () => {
    process.env.REPOSITORIES = 'org/repo1, org/repo2';
    const config = loadConfig();
    expect(config.repositories).toEqual(['org/repo1', 'org/repo2']);
  });

  it('should use default ticket pattern when not set', () => {
    process.env.REPOSITORIES = 'org/repo';
    delete process.env.TICKET_PATTERN;
    const config = loadConfig();
    expect(config.ticketPattern).toBe('\\w+[-\\s]\\d+');
  });

  it('should use custom ticket pattern from env', () => {
    process.env.REPOSITORIES = 'org/repo';
    process.env.TICKET_PATTERN = 'PROJ-\\d+';
    const config = loadConfig();
    expect(config.ticketPattern).toBe('PROJ-\\d+');
  });

  it('should parse ready and QA statuses', () => {
    process.env.REPOSITORIES = 'org/repo';
    process.env.READY_STATUSES = 'Done, Approved';
    process.env.QA_STATUSES = 'Testing, In QA';
    const config = loadConfig();
    expect(config.readyStatuses).toEqual(['Done', 'Approved']);
    expect(config.qaStatuses).toEqual(['Testing', 'In QA']);
  });
});
