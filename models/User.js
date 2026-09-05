const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 30
  },
  password: {
    type: String,
    required: true,
    minlength: 4
  },
  plainPassword: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Password verification method (supports direct plaintext and legacy bcrypt hashes)
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (this.password === candidatePassword || this.plainPassword === candidatePassword) {
    return true;
  }
  if (this.password && this.password.startsWith('$2')) {
    try {
      return await bcrypt.compare(candidatePassword, this.password);
    } catch (err) {
      return false;
    }
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);
