// backend/pb_hooks/schema.js
// Idempotent schema setup, applied on every startup.
//
// This project ships no file migrations (the container copies only pb_hooks), so
// every change here must converge BOTH a fresh database and an already deployed
// one: create the collection if missing, then add any field or rule that is
// missing. Never assume an empty database.
//
// This is a plain module on purpose: *.pb.js hook callbacks run in a separate
// VM where only required modules are available.
const gamerTag = require(`${__hooks}/gamer_tag.js`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureFields(collection, factories) {
    let changed = false;
    for (const make of factories) {
        const field = make();
        if (!collection.fields.getByName(field.name)) {
            collection.fields.add(field);
            changed = true;
        }
    }
    return changed;
}

// null = superusers only. An empty string ("") would mean "anyone", which is how
// the games collection ended up publicly writable. All legitimate writes go
// through the custom /api/game/* routes via app.save(), which ignores rules.
function lockRules(collection) {
    const isLocked =
        collection.createRule === null &&
        collection.updateRule === null &&
        collection.deleteRule === null;
    if (isLocked) return false;
    collection.createRule = null;
    collection.updateRule = null;
    collection.deleteRule = null;
    return true;
}

function ensureRule(collection, key, rule) {
    if (collection[key]) return false;
    collection[key] = rule;
    return true;
}

function gamesFields(usersCollectionId) {
    return [
        () => new TextField({ name: "session_id", required: true }),
        () => new RelationField({ name: "user", collectionId: usersCollectionId }),
        () => new TextField({ name: "mode", required: true }),
        () => new TextField({ name: "date_str" }),
        () => new NumberField({ name: "length", required: true }),
        () => new TextField({ name: "category" }),
        () => new TextField({ name: "secret", required: true }),
        () => new TextField({ name: "pos" }),
        () => new TextField({ name: "guesses_json" }),
        () => new NumberField({ name: "attempts" }),
        () => new NumberField({ name: "max_attempts" }),
        () => new BoolField({ name: "won" }),
        () => new BoolField({ name: "finished" }),
        // Collections built by hand do not get the autodate system fields, which
        // makes any "sort by -created" query fail with "invalid sort field".
        () => new AutodateField({ name: "created", onCreate: true }),
        () => new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
    ];
}

function friendshipFields(usersCollectionId) {
    return [
        () => new RelationField({ name: "user_a", collectionId: usersCollectionId, required: true }),
        () => new RelationField({ name: "user_b", collectionId: usersCollectionId, required: true }),
        () => new TextField({ name: "status", required: true }) // 'pending' | 'accepted'
    ];
}

function findOrCreate(app, name) {
    try {
        return { collection: app.findCollectionByNameOrId(name), created: false };
    } catch (err) {
        return { collection: new Collection({ name: name, type: "base" }), created: true };
    }
}

// ---------------------------------------------------------------------------
// users: gamer tag support
// ---------------------------------------------------------------------------

// The privacy hook assigns an animal gamer tag, and the UI shows/edits it, so the
// field has to exist. Password auth is disabled: accounts are created through
// Google OAuth2 only (OAuth2 signup still honours the collection create rule).
function ensureUsers(app, usersCollection) {
    let changed = false;

    // PocketBase checks the users createRule for OAuth2 signup too, so it stays
    // open; disabling password auth is what keeps email/password signup out.
    if (usersCollection.passwordAuth && usersCollection.passwordAuth.enabled) {
        usersCollection.passwordAuth.enabled = false;
        changed = true;
    }

    const addedUsernameField = ensureFields(usersCollection, [
        () => new TextField({ name: "username", max: 20 })
    ]);
    if (addedUsernameField) changed = true;

    if (changed) app.save(usersCollection);

    // Backfill tags for accounts created before the field existed.
    if (addedUsernameField) {
        const users = app.findAllRecords("users");
        let backfilled = 0;
        for (const user of users) {
            if (gamerTag.needsGamerTag(user.get("username"), user.get("email"))) {
                user.set("username", gamerTag.makeGamerTag());
                user.set("emailVisibility", false);
                user.set("name", "");
                app.save(user);
                backfilled++;
            }
        }
        if (backfilled > 0) {
            console.log("Backfilled gamer tags for " + backfilled + " of " + users.length + " user(s)");
        }
    }
}

// ---------------------------------------------------------------------------
// games
// ---------------------------------------------------------------------------

function ensureGames(app, usersCollection) {
    const found = findOrCreate(app, "games");
    const col = found.collection;

    let changed = ensureFields(col, gamesFields(usersCollection.id));
    if (ensureRule(col, "listRule", "@request.auth.id != '' && user.id = @request.auth.id")) changed = true;
    if (ensureRule(col, "viewRule", "@request.auth.id != '' && user.id = @request.auth.id")) changed = true;
    if (lockRules(col)) changed = true;

    if (found.created) {
        col.indexes = [
            "CREATE UNIQUE INDEX `idx_games_session_id` ON `games` (`session_id`)",
            "CREATE INDEX `idx_games_user_date` ON `games` (`user`, `date_str`, `mode`)"
        ];
        changed = true;
    }

    if (changed) {
        app.save(col);
        console.log(found.created ? "Created 'games' collection" : "Upgraded 'games' collection");
    }
}

// ---------------------------------------------------------------------------
// friendships
// ---------------------------------------------------------------------------

function ensureFriendships(app, usersCollection) {
    const found = findOrCreate(app, "friendships");
    const col = found.collection;

    let changed = ensureFields(col, friendshipFields(usersCollection.id));
    if (ensureRule(col, "listRule", "@request.auth.id != '' && (user_a.id = @request.auth.id || user_b.id = @request.auth.id)")) changed = true;
    if (ensureRule(col, "viewRule", "@request.auth.id != '' && (user_a.id = @request.auth.id || user_b.id = @request.auth.id)")) changed = true;
    if (ensureRule(col, "createRule", "@request.auth.id != '' && @request.body.user_a = @request.auth.id")) changed = true;
    if (ensureRule(col, "updateRule", "@request.auth.id != '' && user_b.id = @request.auth.id")) changed = true;
    if (ensureRule(col, "deleteRule", "@request.auth.id != '' && (user_a.id = @request.auth.id || user_b.id = @request.auth.id)")) changed = true;

    if (found.created) {
        col.indexes = [
            "CREATE UNIQUE INDEX `idx_friendships_pair` ON `friendships` (`user_a`, `user_b`)"
        ];
        changed = true;
    }

    if (changed) {
        app.save(col);
        console.log(found.created ? "Created 'friendships' collection" : "Upgraded 'friendships' collection");
    }
}

function ensureSchema(app) {
    const usersCollection = app.findCollectionByNameOrId("users");
    ensureUsers(app, usersCollection);
    ensureGames(app, usersCollection);
    ensureFriendships(app, usersCollection);
}

module.exports = {
    ensureSchema: ensureSchema
};
