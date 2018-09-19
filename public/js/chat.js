const chatJS = (game, socket) => {
  const chatText = document.getElementById('chat-text');
  const chatInput = document.getElementById('chat-input');
  const chatForm = document.getElementById('chat-form');

  socket.on('addToChat', (data) => {
    chatText.innerHTML += '<div>' + data + '</div>';
  });

  socket.on('evalAnswer', data => {
    console.log(data);
  });

  chatForm.onsubmit = (event) => {
    event.preventDefault();
    if (chatInput.value[0] === '/') {
      socket.emit('evalServer', chatInput.value.slice(1));
    } else {
      socket.emit('sendMsgToServer', chatInput.value);
    }
    chatInput.value = '';
  }
};

export {chatJS}