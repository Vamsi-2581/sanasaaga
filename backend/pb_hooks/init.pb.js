// backend/pb_hooks/init.pb.js
// Automatic schema setup on PocketBase startup

onBootstrap((e) => {
    e.next();

    const usersCol = e.app.findCollectionByNameOrId("users");

    // Check or create 'games' collection
    try {
        e.app.findCollectionByNameOrId("games");
    } catch (err) {
        const gamesCol = new Collection({
            name: "games",
            type: "base"
        });

        gamesCol.fields.add(new TextField({ name: "session_id", required: true }));
        gamesCol.fields.add(new RelationField({ name: "user", collectionId: usersCol.id }));
        gamesCol.fields.add(new TextField({ name: "mode", required: true }));
        gamesCol.fields.add(new TextField({ name: "date_str" }));
        gamesCol.fields.add(new NumberField({ name: "length", required: true }));
        gamesCol.fields.add(new TextField({ name: "category" }));
        gamesCol.fields.add(new TextField({ name: "secret", required: true }));
        gamesCol.fields.add(new TextField({ name: "pos" }));
        gamesCol.fields.add(new TextField({ name: "guesses_json" }));
        gamesCol.fields.add(new NumberField({ name: "attempts" }));
        gamesCol.fields.add(new NumberField({ name: "max_attempts" }));
        gamesCol.fields.add(new BoolField({ name: "won" }));
        gamesCol.fields.add(new BoolField({ name: "finished" }));

        gamesCol.listRule = "@request.auth.id != '' && user.id = @request.auth.id";
        gamesCol.viewRule = "@request.auth.id != '' && user.id = @request.auth.id";
        gamesCol.createRule = "";
        gamesCol.updateRule = "";
        gamesCol.deleteRule = null;

        gamesCol.indexes = [
            "CREATE UNIQUE INDEX `idx_games_session_id` ON `games` (`session_id`)",
            "CREATE INDEX `idx_games_user_date` ON `games` (`user`, `date_str`, `mode`)"
        ];

        e.app.save(gamesCol);
        console.log("Created 'games' collection successfully");
    }

    // Check or create 'friendships' collection
    try {
        e.app.findCollectionByNameOrId("friendships");
    } catch (err) {
        const friendsCol = new Collection({
            name: "friendships",
            type: "base"
        });

        friendsCol.fields.add(new RelationField({ name: "user_a", collectionId: usersCol.id, required: true }));
        friendsCol.fields.add(new RelationField({ name: "user_b", collectionId: usersCol.id, required: true }));
        friendsCol.fields.add(new TextField({ name: "status", required: true })); // 'pending' | 'accepted'

        friendsCol.listRule = "@request.auth.id != '' && (user_a.id = @request.auth.id || user_b.id = @request.auth.id)";
        friendsCol.viewRule = "@request.auth.id != '' && (user_a.id = @request.auth.id || user_b.id = @request.auth.id)";
        friendsCol.createRule = "@request.auth.id != '' && @request.body.user_a = @request.auth.id";
        friendsCol.updateRule = "@request.auth.id != '' && user_b.id = @request.auth.id";
        friendsCol.deleteRule = "@request.auth.id != '' && (user_a.id = @request.auth.id || user_b.id = @request.auth.id)";

        friendsCol.indexes = [
            "CREATE UNIQUE INDEX `idx_friendships_pair` ON `friendships` (`user_a`, `user_b`)"
        ];

        e.app.save(friendsCol);
        console.log("Created 'friendships' collection successfully");
    }
});
