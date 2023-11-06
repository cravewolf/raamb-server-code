const { MongoClient } = require('mongodb');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
  }
});


const connectionUri = 'mongodb+srv://cravewolf:fBQcL0gSMNpOw0zg@cluster0.manlfyy.mongodb.net/?retryWrites=true&w=majority';

const userSessions = new Map();

let mongoClient;


function updateSessionActivity(sessionId) {
  const currentTime = Date.now();
  const session = userSessions.get(sessionId);
  if(session){
  session.lastActivityTime = currentTime;
  console.log(session, "getSession")
  userSessions.set(sessionId, session);
  }
}

io.on('connection', (socket) => {
  // ... other event handlers ...

  // Node.js pseudo-code using a MongoDB client
socket.on('bookMechanic', async (bookingData) => {
  console.log(bookingData);
  try {
    const booking = await db.collection('bookings').insertOne({
      userId: bookingData.userId,
      mechanicId: bookingData.mechanicId,
      userLocation: bookingData.userLocation,
      bookingTime: new Date(bookingData.bookingTime),
      status: 'pending', // Default status
      // Add other fields as needed
    });

    socket.emit('bookingStatus', { status: 'pending', bookingId: booking.insertedId });
  } catch (error) {
    console.error('Booking error:', error);
    socket.emit('bookingStatus', { status: 'error', message: 'Could not create booking' });
    
  }
});


  // Handling mechanic's response to a booking
  socket.on('mechanicResponse', async (response) => {
    try {
      console.log('Mechanic Response:', response);
      const bookingsCollection = mongoClient.db("bookings").collection("bookingRecords");
      
      // Convert string ID to MongoDB ObjectId
      const bookingId = new MongoClient.ObjectID(response.bookingId);

      // Update the booking status based on mechanic's response
      await bookingsCollection.updateOne(
        { _id: bookingId },
        { $set: { status: response.status } }
      );

      // Notify the user about the mechanic's response
      io.to(response.userId).emit('bookingStatus', { status: response.status });
    } catch (error) {
      console.error('Error handling mechanic response:', error);
    }
  });

  // ... other event handlers ...
});


// ... rest of your server code


// Function to check and update the session status
async function checkSessionStatus() {
  console.log(userSessions, "sessions")
  const currentTime = Date.now();

  const expiredSessions = [];

  for (const [sessionId, session] of userSessions.entries()) {
    const timeElapsed = currentTime - session.lastActivityTime;
    console.log(currentTime , session.lastActivityTime, "time")
    if (timeElapsed > 10000) {
      // Mark the session as expired
      expiredSessions.push(sessionId);
      // Emit the logout event to the specific client associated with the session
      // io.to(sessionId).emit('logout');

      if (session.role === 'Driver') {
        // Emit the event to all users with the role 'Mechanic'
        console.log("emitting to mechanicUserStatusUpdate")
        io.sockets.emit('mechanicUserStatusUpdate', { userId: sessionId, isLogged: false });
      }
       if (session.role === 'Mechanic') {
        console.log("emitting to driverUserStatusUpdate")
        // Emit the event to all users with the role 'Driver'
        io.sockets.emit('driverUserStatusUpdate', { userId: sessionId, isLogged: false });
      }
    }
  }
  console.log(expiredSessions, "es")
  if (expiredSessions.length > 0) {
    // Update the user statuses to 'isLogged: false' in MongoDB
    await updateUserStatusInDb(expiredSessions, false);
    // Remove the expired sessions from the userSessions map
    for (const sessionId of expiredSessions) {
      userSessions.delete(sessionId);
    }
  }
}

// Function to update the user statuses in MongoDB
async function updateUserStatusInDb(sessionIds, isLogged) {
  try {
    const collection = mongoClient.db().collection('users');

    await collection.updateMany(
      { _id: { $in: sessionIds } },
      { $set: { isLogged: isLogged } }
    );
    
  } catch (error) {
    console.error('Error updating user statuses in MongoDB:', error);
  }
}



io.on('connection', socket => {
  console.log('a user connected:', socket.id);

  socket.on('sendMessage', message => {
    console.log('Message received:', message);
    // Ensure the message object has the expected structure
    if (typeof message === 'object' && message.content && message.sender) {
      // Echo the message back with the same structure
      io.emit('receiveMessage', {
        content: message.content,
        sender: message.sender
      });
    } else {
      console.error('Message object structure is incorrect:', message);
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});


io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('mechanicLocationUpdate', (data) => {
    console.log(data, "mechannicupdate")
    // Broadcast the location update to all mechanic roles'
       
    io.sockets.emit('driverLocationUpdate', data);
    // if(!userSessions.get(data.userId)){
    //   data.isLogged = true
    //   userSessions.set(data.userId, data);
    //   io.sockets.emit('driverUserStatusUpdate', data);   
    //   }
      updateSessionActivity(data.userId)

  });

  socket.on('mechanicUserStatusUpdate', (data) => {
 
    console.log(data, "mechannistatuscupdate")
    if(!userSessions.get(data.userId)){
    userSessions.set(data.userId, data);
    io.sockets.emit('driverUserStatusUpdate', data); 
    }
    updateSessionActivity(data.userId)
    // Broadcast the location update to all mechanic roles                                          
  });


  socket.on('driverLocationUpdate', (data) => {
    console.log(data, "driverLocationUpdate")

    io.sockets.emit('mechanicLocationUpdate', data);
    //  if(!userSessions.get(data.userId)){
    // data.isLogged = true
    // userSessions.set(data.userId, data);
    // io.sockets.emit('mechanicUserStatusUpdate', data);
    // }
    updateSessionActivity(data.userId)
      
    // Broadcast the location update to all mechanic roles

  });

  
  socket.on('driverUserStatusUpdate', (data) => {

    console.log(data, "driverStatusUpdate")
    // Broadcast the location update to all mechanic roles
    if(!userSessions.get(data.userId)){
      userSessions.set(data.userId, data);
      io.sockets.emit('mechanicUserStatusUpdate', data);
      }
    updateSessionActivity(data.userId)
  });


  socket.on('disconnect', () => {
    console.log(`Client disconnected`);
  });
});

async function connectToMongo() {
  try {
    mongoClient = await MongoClient.connect(connectionUri, { useNewUrlParser: true });
    console.log('Connected to MongoDB successfully!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}


setInterval(() => {

  checkSessionStatus();
  
}, 5000);


const port = 3000;
server.listen(port, async() => {
  await connectToMongo();
  console.log(`Server is running on port ${port}`);
});
