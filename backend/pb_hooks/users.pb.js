// backend/pb_hooks/users.pb.js
// OAuth registration privacy hook:
// Strips user email visibility & actual name, assigning a Finnish gamer tag.

onRecordCreateRequest((e) => {
    if (e.record.collection().name === "users") {
        // Hide email from public view
        e.record.set("emailVisibility", false);

        // Strip real name provided by OAuth provider
        e.record.set("name", "");

        // If username is empty or matches email prefix, assign a Finnish gamer tag
        const currentUsername = e.record.get("username") || "";
        const email = e.record.get("email") || "";
        const emailPrefix = email.split("@")[0];

        if (!currentUsername || currentUsername === emailPrefix) {
            const animals = [
                "Kettu", "Ilves", "Karhu", "Susi", "Ahma", "Norppa",
                "Hirvi", "Metso", "Kuukkeli", "Siili", "Saukko", "Pöllö"
            ];
            const chosen = animals[Math.floor(Math.random() * animals.length)];
            const num = Math.floor(100 + Math.random() * 900);
            e.record.set("username", chosen + num);
        }
    }

    e.next();
}, "users");
