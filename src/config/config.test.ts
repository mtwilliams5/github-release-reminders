import { loadConfig } from './config';

jest.mock('@aws-sdk/client-ssm');

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, IS_LOCAL: 'true' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should throw when REPOSITORIES is not set', async () => {
    delete process.env.REPOSITORIES;
    await expect(loadConfig()).rejects.toThrow(
      'Environment variable REPOSITORIES is required when running locally',
    );
  });

  it('should parse comma-separated repositories', async () => {
    process.env.REPOSITORIES = 'org/repo1, org/repo2';
    const config = await loadConfig();
    expect(config.repositories).toEqual(['org/repo1', 'org/repo2']);
  });

  it('should use default ticket pattern when not set', async () => {
    process.env.REPOSITORIES = 'org/repo';
    delete process.env.TICKET_PATTERN;
    const config = await loadConfig();
    expect(config.ticketPattern).toBe('\\w+[-\\s]\\d+');
  });

  it('should use custom ticket pattern from env', async () => {
    process.env.REPOSITORIES = 'org/repo';
    process.env.TICKET_PATTERN = 'PROJ-\\d+';
    const config = await loadConfig();
    expect(config.ticketPattern).toBe('PROJ-\\d+');
  });

  it('should parse ready and QA statuses', async () => {
    process.env.REPOSITORIES = 'org/repo';
    process.env.READY_STATUSES = 'Done, Approved';
    process.env.QA_STATUSES = 'Testing, In QA';
    const config = await loadConfig();
    expect(config.readyStatuses).toEqual(['Done', 'Approved']);
    expect(config.qaStatuses).toEqual(['Testing', 'In QA']);
  });
});
