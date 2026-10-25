// backend/pb_hooks/init.pb.js
// Entry point: apply the idempotent schema on startup.
// Keep this file thin - hook callbacks run in a separate VM, so all logic lives
// in plain *.js modules that are require()-d inside the callback.
onBootstrap((e) => {
    e.next();

    const schema = require(`${__hooks}/schema.js`);
    schema.ensureSchema(e.app);
});
