const { MongoClient, ObjectId } = require('mongodb');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');



const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = socketIO(server, {
 cors: {
    origin: "*",
  }
});
const fs = require('fs');
const path = require('path');

const connectionUri = 'mongodb+srv://cravewolf:fBQcL0gSMNpOw0zg@cluster0.manlfyy.mongodb.net/?retryWrites=true&w=majority';

const userSessions = new Map();

let mongoClient;

app.use(cors());

function updateSessionActivity(sessionId) {
  const currentTime = Date.now();
  const session = userSessions.get(sessionId);
  if(session){
  session.lastActivityTime = currentTime;
  console.log(session, "getSession")
  userSessions.set(sessionId, session);
  }
}
async function handleBookingUpdate(bookingId, status) {
    const db = mongoClient.db();
    const collection = db.collection('bookings');
    // Update booking status based on bookingId
    await collection.updateOne({ _id: bookingId }, { $set: { status: status } });
}

// Function to fetch a booking by its ID
async function getBookingById(bookingId) {
  console.log("Fetching booking with ID:", bookingId);

  const db = mongoClient.db();
  const bookings = db.collection('bookings');

  try {
      // Convert string ID to ObjectId
      const objectId = new ObjectId(bookingId);
      const booking = await bookings.findOne({ _id: objectId }); 
      console.log("Fetched booking:", booking);

      return booking;
  } catch (error) {
      console.error("Error fetching booking:", error);
      return null;
  }
}
async function getActionFromTransactions(bookingId) {
  const db = mongoClient.db();
  const transaction = db.collection('transactions').findOne({ bookingId: bookingId });

  return transaction ? transaction.action : null;
}

async function updateUserProfilePicture(userId, imagePath) {
  const db = mongoClient.db();
  const usersCollection = db.collection('users');
  console.log('image');

  // Update user's profile picture based on userId
  await usersCollection.updateOne(
      { _id: userId },
      { $set: { profilePicture: imagePath } }
  );
}
app.post('/uploadProfilePicture', async (req, res) => {
  try {
    const { userId, imageBase64 } = req.body;
    
    // Decode the base64 image
    const buffer = Buffer.from(imageBase64, 'base64');
    // Create a unique filename for the image
    const imagePath = path.join(__dirname, 'uploads', `${userId}-${Date.now()}.jpg`);
    // Save the image to the filesystem
    fs.writeFileSync(imagePath, buffer);

    // Convert userId to ObjectId if necessary
    const objectId = new ObjectId(userId);

    // Update the user's profile picture in the database
    await updateUserProfilePicture(objectId, imagePath);

    res.status(200).json({ message: 'Profile picture updated successfully', imageUrl: imagePath });
  } catch (error) {
    console.error('Error updating profile picture:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/users', async (req, res) => {
  console.log('ers');
  try {
    const newUser = new User(req.body);
    await newUser.save();
    res.status(201).send(newUser);
  } catch (error) {
    res.status(500).send(error);
  }
});
app.get('/users', async (req, res) => {
  console.log('youse');
  try {
    // Assuming mongoClient is already connected to your MongoDB instance
    const db = mongoClient.db();
    const collection = db.collection('users');
    const users = await collection.find({}).toArray();

    // Send the users as JSON response
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    // Handle errors with a 500 Internal Server Error response
    res.status(500).send('Error fetching users');
  }
});
app.get('/verification-requests', async (req, res) => {
  try {
    // Assuming mongoClient is already connected to your MongoDB instance
    const db = mongoClient.db();
    const collection = db.collection('verificationRequests');

    // Fetching all documents from the 'verificationRequests' collection
    const verificationRequests = await collection.find({}).toArray();

    // Sending the fetched documents as a JSON response
    res.json(verificationRequests);
  } catch (error) {
    console.error('Error fetching verification requests:', error);
    res.status(500).send({ message: 'Error fetching verification requests' });
  }
});


app.post('/submitVerification', async (req, res) => {
  try {
    // Extract verification data from request body
    const verificationData = req.body;

    // Access the MongoDB 'verifications' collection
    const db = mongoClient.db();
    const verificationsCollection = db.collection('verifications');

    // Insert the verification data into the collection
    const result = await verificationsCollection.insertOne(verificationData);

    // Send a success response
    res.status(200).json({ message: 'Verification submitted successfully', id: result.insertedId });
  } catch (error) {
    console.error('Error submitting verification:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});





// Updated logTransaction function to include mechanicId
async function logTransaction(bookingId, action) {
  const booking = await getBookingById(bookingId);

  if (!booking) {
      console.warn('Booking not found for ID:', bookingId);
      // You could choose to return here or take alternative action
      return { error: 'Booking not found', bookingId };
  }

  const mechanicId = booking.mechanicId;
  const userId = booking.userId; // Retrieve mechanicId from the booking
  const db = mongoClient.db();
  const transactions = db.collection('transactions');

  await transactions.insertOne({
      bookingId,
      userId,
      mechanicId, // Include mechanicId in the transaction
      action,
      timestamp: new Date()
  });

  return { success: true, bookingId,userId, mechanicId, action }; // Optionally return success confirmation
}




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

async function bookMechanic(bookingData) {
    try {
        
        const collection = mongoClient.db().collection('bookings');

        // Insert the booking data into the 'bookings' collection
        const result = await collection.insertOne(bookingData);
        return result;
    } catch (error) {
        console.error("Error in bookMechanic function:", error);
        throw error; // Rethrowing the error to be handled by the caller
    }
}






// io.on('connection', socket => {
 

  // ... other event handlers ...



io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('register', (userId) => {
    userSessions.set(userId, socket.id);
    console.log('registered');
  });

  socket.on('requestTransactions', async () => {
    console.log('reqd');
    try {
      const db = mongoClient.db();
      const transactionsCollection = db.collection('transactions');
  
      const transactions = await transactionsCollection.aggregate([
        {
          $lookup: {
            from: "users",
            let: { mechanicId: "$mechanicId" }, // Define mechanicId as a variable for the pipeline
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$mechanicId"] } } }, // Use the variable in a match stage
              { $project: { firstName: 1, lastName: 1 } }
            ],
            as: "mechanicDetails"
          }
        },
        {
          $unwind: {
            path: "$mechanicDetails",
            preserveNullAndEmptyArrays: true // Preserve transactions without mechanic details
          }
        },
        {
          $project: {
            bookingId: 1,
            mechanicId: 1,
            userId: 1,
            action: 1,
            timestamp: 1,
            "mechanicDetails.firstName": 1,
            "mechanicDetails.lastName": 1
          }
        }
      ]).toArray();
  
      socket.emit('transactionsData', transactions);
      console.log ('booii');
    } catch (error) {
      console.error('Error fetching transactions:', error);
      socket.emit('error', error.message);
    }
  });
  
  



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
  socket.on('requestBookingStatus', async (data) => {
    console.log('iwerk');
    const bookingId = data.bookingId;

    // Fetch the action from the transactions collection
    const action = await getActionFromTransactions(bookingId);

    const status = await handleBookingUpdate(bookingId);
    console.log('iwerking');
    socket.emit('bookingStatus', { status, action });
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

  socket.on('sendMessage', async (messageData) => {
    console.log('New message event received', messageData);
    try {
      // Insert the message into the database
      const result = await mongoClient.db().collection('messages').insertOne({
        senderId: messageData.senderId,
        receiverId: messageData.receiverId,
        content: messageData.content,
        timestamp: new Date(),
        read: false
      });
      console.log('Message saved to DB with ID:', result.insertedId);
  
      // Retrieve the receiver's socket ID using their user ID
      const receiverSocketId = userSessions.get(messageData.receiverId);
      if (receiverSocketId) {
        // Emit the message to the receiver using their socket ID
        io.to(receiverSocketId).emit('receiveMessage', {
          _id: result.insertedId.toString(),
          content: messageData.content,
          senderId: messageData.senderId,
          timestamp: new Date()
        });
        console.log('mhie', receiverSocketId);
      } else {
        console.log(`Receiver ${messageData.receiverId} is not connected.`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('sendMessageError', { error: 'Message could not be saved.' });
    }
  });


  socket.on('disconnect', () => {
    console.log(`Client disconnected`);
  });

  // Node.js server-side code using Socket.IO
socket.on('requestChatHistory', async (data) => {
  try {
    const { sessionId, user } = data;
    const db = mongoClient.db();
    const collection = db.collection('messages');

    const messagesDocuments = await collection.find({
      '$or': [
        { 'senderId': sessionId, 'receiverId': user },
        { 'senderId': user, 'receiverId': sessionId },
      ]
    }).sort({ timestamp: 1 }).toArray(); // Sort by timestamp to get messages in order

    // Emit the chat history back to the requesting client
    socket.emit('chatHistoryResponse', messagesDocuments);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    // Optionally, emit back to the client that there was an error
    socket.emit('chatHistoryError', { error: 'Could not fetch chat history.' });
  }
});

socket.on('request-users', async () => {
    try {
      const db = mongoClient.db();
      const collection = db.collection('users');
      const users = await collection.find({}).toArray();

      // Emit the 'users' event to the socket client with the users data
      socket.emit('users', users);
    } catch (error) {
      console.error('Error fetching users:', error);
      socket.emit('error', 'Error fetching users');
    }
  });
  socket.on('request-verification-requests', async () => {
    console.log('Received request for verification requests');
    try {
      const db = mongoClient.db();
      const collection = db.collection('verifications');
      const verificationRequests = await collection.find({}).toArray();
  
      socket.emit('verification-requests', verificationRequests);
      console.log('got it');
    } catch (error) {
      console.error('Error fetching verification requests:', error);
      // Emitting error details for debugging; be cautious in a production environment
      socket.emit('error', `Error fetching verification requests: ${error.message}`);
    }
  });
  
  

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  socket.on('bookMechanic', async (bookingData) => {
    console.log('booking');
        try {
            const bookingResult = await bookMechanic(bookingData);
            socket.emit('booking-confirmation', bookingResult);
            console.log('booking-confirmed');
            
        } catch (error) {
            socket.emit('booking-error', error.message);
            console.error('booking error');
        }
    });
    socket.on('getBookings', async () => {
    try {
        const db = mongoClient.db(); // Make sure mongoClient is correctly initialized and connected
        const collection = db.collection('bookings'); // Access the 'bookings' collection

        // Fetch bookings from the collection
       const bookings = await collection.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userDetails"
          }
        },
        {
          $unwind: "$userDetails"
        },
        {
          $project: {
            _id: 1,
            mechanicId: 1,
            userId: 1,
            userLocation: 1,
            bookingTime: 1,
            "userDetails.firstName": 1, // Include firstName from the "users" collection
            "userDetails.lastName": 1  // Optionally include other user details
          }
        }
      ]).toArray()
      console.log('aggre'); // This retrieves all bookings

        // Emit the fetched bookings to the client
        socket.emit('bookingsData', bookings);
        console.log('fetchbook')
    } catch (error) {
        console.error('Error fetching bookings:', error);
        socket.emit('error', error.message); // Emitting an error message to the client
    }
});
socket.on('acceptBooking', async (bookingId) => {
        try {
            await handleBookingUpdate(bookingId, 'accepted');
            socket.emit('bookingResponse', { status: 'Accepted', bookingId });
            // Log the transaction
            logTransaction(bookingId, 'On-going');
            console.log('accep');
        } catch (error) {
            socket.emit('bookingError', error.message);
        }
    });

    socket.on('declineBooking', async (bookingId) => {
        try {
            await handleBookingUpdate(bookingId, 'declined');
            socket.emit('bookingResponse', { status: 'Declined', bookingId });
            // Log the transaction
            logTransaction(bookingId, 'declined');
        } catch (error) {
            socket.emit('bookingError', error.message);
        }
    });
  //   socket.on('requestBookingStatus', async (data) => {
  //     const bookingId = data.bookingId;
  //     const status = await getCurrentBookingStatus(bookingId);
  //     socket.emit('bookingStatus', status);
  // });

    
    socket.on('markBookingComplete', async (data) => {
      console.log('complete');
      console.log('Received data:', data); // Debug: Print received data
  
      try {
          const { bookingId } = data; // Extract the bookingId from the data object
          console.log('Booking ID:', bookingId); // Debug: Print the booking ID
  
          // Update the booking status to 'complete'
          await handleBookingUpdate(bookingId, 'complete');
  
          // Log the transaction with action set to 'Complete'
          const logResult = await logTransaction(bookingId, 'Complete');
  
          if (logResult.error) {
              // Handle error in logging transaction
              socket.emit('bookingCompleteError', logResult);
          } else {
              // Emit a confirmation event to the client
              socket.emit('bookingCompleteConfirmation', { bookingId, logResult });
          }
      } catch (error) {
          console.error('Error in markBookingComplete:', error);
          socket.emit('bookingCompleteError', { error: error.message, bookingId });
      }
  });
  
    
    


});

async function connectToMongo() {
  try {
    mongoClient = await MongoClient.connect(connectionUri, { useNewUrlParser: true, useUnifiedTopology: true});
    console.log('Connected to MongoDB successfully!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}


setInterval(() => {

  checkSessionStatus();
  
  
}, 5000);


const port = process.env.PORT || 3000;

server.listen(port, async() => {
  await connectToMongo();
  console.log(`Server is running on port ${port}`);
});
