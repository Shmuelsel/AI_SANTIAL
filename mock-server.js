// mock-server.js
import { Server } from "socket.io";

const io = new Server(3001, {
  cors: {
    origin: "*", // מאפשר לריאקט להתחבר
  },
});

console.log("🤖 Mock AI Server running on port 3001...");

// פונקציה שמייצרת קואורדינטות רנדומליות
const generateDetection = () => {
  return {
    id: Date.now(),
    camera_id: "CAM-01",
    timestamp: new Date().toISOString(),
    label: "Person",
    confidence: (Math.random() * (0.99 - 0.75) + 0.75).toFixed(2), // בין 75% ל-99%
    // קואורדינטות באחוזים (0 עד 1) כדי שיתאים לכל גודל מסך!
    bbox: {
      x: Math.random() * 0.6,      // מיקום אופקי
      y: Math.random() * 0.6,      // מיקום אנכי
      w: 0.1 + Math.random() * 0.2, // רוחב
      h: 0.2 + Math.random() * 0.3  // גובה
    }
  };
};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("feedback", (data) => {
    console.log(`📢 User Decision Received: Event [${data.eventId}] marked as [${data.status}]`);
    // כאן בעתיד נשמור את המידע לדאטה-בייס כדי לאמן את ה-AI
  });

  // שלח התראה כל 3 שניות
  const interval = setInterval(() => {
    const detection = generateDetection();
    console.log("Sending alert:", detection.id);
    socket.emit("alert", detection);
  }, 3000);

  socket.on("disconnect", () => {
    clearInterval(interval);
    console.log("Client disconnected");
  });
});