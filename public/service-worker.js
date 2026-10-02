self.addEventListener("push", function(event) {
    const data = event.data.json();
    const title = data.title;
    const options = {
        body: data.message,
        icon: "https://static.vecteezy.com/system/resources/thumbnails/023/009/485/small_2x/abstract-animal-owl-portrait-with-colorful-double-exposure-paint-with-generative-ai-free-photo.jpeg",
        badge: "https://pics.craiyon.com/2023-09-14/98a67a3e507d447fa0f99e6052a0c940.webp",
        vibrate: [200, 100, 200],
        data: {
            url: "/"
        }
    };

    event.waitUntil(
        self.registration.showNotification(
            title,
            options
        )
    );
});

// When notification is clicked
self.addEventListener("notificationclick",function(event) {
        event.notification.close();
        event.waitUntil(
            clients.openWindow(
                event.notification.data.url
            )

        );

    }
);