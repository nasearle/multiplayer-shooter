const chatJS = (socket) => {
  const chatText = document.getElementById('chat-text');
  const chatInput = document.getElementById('chat-input');
  const chatForm = document.getElementById('chat-form');

  socket.on('addToChat', (data) => {
    chatText.innerHTML += '<div>' + data + '</div>';
  });

  chatForm.onsubmit = (event) => {
    event.preventDefault();
    socket.emit('sendMsgToServer', chatInput.value);
    chatInput.value = '';
  }
};

export {chatJS}