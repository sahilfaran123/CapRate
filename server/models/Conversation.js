import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const conversationSchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true },
  title:     { type: String, default: 'New conversation' },
  messages:  { type: [messageSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

conversationSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Auto-title from first user message
conversationSchema.methods.autoTitle = function () {
  const first = this.messages.find(m => m.role === 'user');
  if (first) {
    this.title = first.content.slice(0, 60) + (first.content.length > 60 ? '…' : '');
  }
};

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
