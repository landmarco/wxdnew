module.exports = {
  apps: [
    {
      name: 'wxdu-api',
      script: 'server.js',
      // Update this path to wherever the repo lives on the server (under the computing user)
      cwd: '/var/www/wxdnew/api',
      // Point at the nvm-installed node that is >= 14. After running
      //   nvm install 20 && nvm alias default 20
      // as the computing user, the path will be:
      interpreter: '/home/computing/.nvm/versions/node/v20.0.0/bin/node',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
