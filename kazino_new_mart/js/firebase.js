    const firebaseConfig = {
        apiKey: "AIzaSyC8UkaoaI7nHRSxNPddRwXnNxzHX7kt8s8",
        databaseURL: "https://tornadogame-41ae2-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "tornadogame-41ae2",
        appId: "1:926174944730:web:20be5b57efb23ab853b4e3"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database(); // ✅ добавь эту строку
