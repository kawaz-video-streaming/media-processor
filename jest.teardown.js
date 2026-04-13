const { rmSync, existsSync } = require('fs');
const { join } = require('path');

module.exports = async () => {
    const tmpDir = join(__dirname, 'tmp');
    if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
    }
};
