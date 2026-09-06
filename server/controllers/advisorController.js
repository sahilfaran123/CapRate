import Anthropic     from '@anthropic-ai/sdk';
import Conversation  from '../models/Conversation.js';
import { buildFinancialContext } from '../services/financialContext.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(financialSummary) {
  return `You are FinSync Advisor, a sharp and direct personal financial advisor with full access to the user's real financial data.

## What You Have Access To
You have a complete structured snapshot of the user's finances including every bank account balance, credit limits, investment holdings with cost basis and gain/loss, real estate properties with full expense breakdowns and equity calculations, and 90 days of transaction history broken down by category and week.

## Critical Rules
- ALWAYS use the exact numbers from the financial snapshot — never estimate or say you don't have data that is clearly present
- If a specific number is in the snapshot, state it directly and confidently
- If data is genuinely missing, say exactly what field is missing and how to add it in FinSync
- Never suggest connecting accounts or adding data that is already there
- Use dollar amounts and percentages in every answer where relevant
- Lead with the answer, then explain if needed

## Real Estate Intelligence
When answering real estate questions:
- Always compare properties to each other when the user asks about performance
- Calculate and state cash-on-cash return when discussing property returns
- Flag any property with negative cash flow proactively
- When discussing equity, break it down into paydown vs appreciation components
- If a property has no expense data entered, tell the user exactly which fields to fill in
- For refinance questions, calculate the break-even period if you have enough data
- Always state cap rate and cash-on-cash return together when evaluating a property

## Key Real Estate Formulas You Know
- Cash-on-Cash Return = (Annual Cash Flow / Down Payment) × 100
- Cap Rate = (Annual NOI / Property Value) × 100
- NOI = Annual Rent - Annual Expenses (excluding mortgage)
- Break-Even Refinance = Closing Costs / Monthly Savings
- GRM = Property Value / Annual Rent

## User's Complete Financial Snapshot
${financialSummary}

## Tone
Confident, specific, and direct. Like a CFO who knows every line of the user's balance sheet.`;
}

// ─── POST /chat ───────────────────────────────────────────────────────────────
export const chat = async (req, res, next) => {
  try {
    const { message, conversationId } = req.body;

    // Build financial context using MongoDB _id from JWT
    const { summary } = await buildFinancialContext(req.userId);

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation || conversation.userId !== req.userId.toString()) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      conversation = new Conversation({ userId: req.userId.toString(), messages: [] });
    }

    conversation.messages.push({ role: 'user', content: message });

    const recentMessages = conversation.messages.slice(-20).map(m => ({
      role: m.role, content: m.content,
    }));

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    let fullResponse = '';
    const stream = await anthropic.messages.stream({
      model:      'claude-sonnet-4-6',
      max_tokens: 1500,
      system:     buildSystemPrompt(summary),
      messages:   recentMessages,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
      }
    }

    conversation.messages.push({ role: 'assistant', content: fullResponse });
    if (conversation.messages.length === 2) conversation.autoTitle();
    await conversation.save();

    res.write(`data: ${JSON.stringify({
      type: 'done',
      conversationId: conversation._id.toString(),
      title: conversation.title,
    })}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong' })}\n\n`);
      res.end();
    }
  }
};

// ─── GET /conversations ───────────────────────────────────────────────────────
export const getConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ userId: req.userId.toString() })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('_id title updatedAt messages');

    res.json({
      conversations: conversations.map(c => ({
        id:           c._id,
        title:        c.title,
        updatedAt:    c.updatedAt,
        messageCount: c.messages.length,
        preview:      c.messages[c.messages.length - 1]?.content?.slice(0, 80) || '',
      })),
    });
  } catch (err) { next(err); }
};

// ─── GET /conversations/:id ───────────────────────────────────────────────────
export const getConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || conversation.userId !== req.userId.toString()) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ conversation });
  } catch (err) { next(err); }
};

// ─── DELETE /conversations/:id ────────────────────────────────────────────────
export const deleteConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || conversation.userId !== req.userId.toString()) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    await conversation.deleteOne();
    res.json({ success: true });
  } catch (err) { next(err); }
};
