module.exports = {
    testDir: './tests',
    timeout: 60000,
    retries: 0,
    use: {
        baseURL: 'http://localhost:8601',
        headless: true,
        viewport: { width: 1280, height: 900 },
    },
};
