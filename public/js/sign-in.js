const signInJS = socket => {
  const signDiv = document.getElementById('signDiv');
  const signDivUsername = document.getElementById('signDiv-username');
  const signDivSignIn = document.getElementById('signDiv-signIn');
  const signDivSignUp = document.getElementById('signDiv-signUp');
  const signDivPassword = document.getElementById('signDiv-password');

  signDivSignIn.onclick = () => {
    socket.emit('signIn', { username: signDivUsername.value, password: signDivPassword.value })
  }

  signDivSignUp.onclick = () => {
    socket.emit('signUp', { username: signDivUsername.value, password: signDivPassword.value })
  }

  socket.on('signInResponse', data => {
    if (data.success) {
      signDiv.style.display = 'none';
      gameDiv.style.display = 'inline-block';
    } else {
      alert('Sign in unsuccessful');
    }
  });

  socket.on('signUpResponse', data => {
    if (data.success) {
      alert('Sign up successful');
    } else {
      alert('Sign up unsuccessful');
    }
  });
}

export { signInJS };
