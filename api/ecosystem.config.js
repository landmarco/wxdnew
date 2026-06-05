module.exports = {
  apps: [
    {
      name: 'wxdu-api',
      script: 'server.js',
      cwd: '/var/www/wxdnew/api',
      interpreter: '/home/computing/.nvm/versions/node/v16.20.2/bin/node',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
