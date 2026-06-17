'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Task 5: Veo Budget Tracker + ROI Gate
 */

const getBudgetFile = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return path.join(__dirname, '..', 'renders', `veo-budget-${year}-${month}.json`);
};

function getBudget() {
  const file = getBudgetFile();
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return {
    monthCap: 95,
    gensUsed: 0,
    reserve: 10,
    allocations: []
  };
}

function saveBudget(budget) {
  const file = getBudgetFile();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(budget, null, 2));
}

function allocate(directorPackage) {
  const budget = getBudget();
  const available = budget.monthCap - budget.gensUsed - budget.reserve;
  const score = directorPackage.confidenceScore || 0;

  let gensToAllocate = 0;
  if (score >= 93) gensToAllocate = 6;
  else if (score >= 85) gensToAllocate = 4;
  else if (score >= 75) gensToAllocate = 2;

  // Don't exceed available budget, but allow using reserve if score is very high (>=95)
  let actualAvailable = available;
  if (score >= 95) actualAvailable = budget.monthCap - budget.gensUsed;

  if (gensToAllocate > actualAvailable) {
    gensToAllocate = actualAvailable > 0 ? actualAvailable : 0;
  }

  if (gensToAllocate > 0) {
    budget.gensUsed += gensToAllocate;
    const allocation = {
      genId: `veo-${Date.now()}`,
      conceptTitle: directorPackage.concept || 'Unknown',
      confidenceScore: score,
      gensAllocated: gensToAllocate,
      videoViews: null,
      comments: null,
      watchThrough: null,
      estimatedROI: score >= 90 ? 'high' : (score >= 80 ? 'medium' : 'low'),
      actualROI: null,
      date: new Date().toISOString()
    };
    budget.allocations.push(allocation);
    saveBudget(budget);
    return { allocated: gensToAllocate, balance: budget.monthCap - budget.gensUsed, allocation };
  }

  return { allocated: 0, balance: budget.monthCap - budget.gensUsed };
}

module.exports = { allocate, getBudget };

if (require.main === module) {
  if (process.argv.includes('--status')) {
    const budget = getBudget();
    console.log(`Veo Budget Status: ${budget.gensUsed}/${budget.monthCap} used. Reserve: ${budget.reserve}. Available (non-reserve): ${budget.monthCap - budget.gensUsed - budget.reserve}`);
  }
}
