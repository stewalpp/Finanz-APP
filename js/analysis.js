/* js/analysis.js — window.Analysis
 * Pure analysis functions: no DOM, no Store access.
 * Exception per SPEC §8: may call App.fmtEUR / App.cat for tip and ICS text building.
 * All money values are integer cents, dates are 'YYYY-MM-DD', month keys 'YYYY-MM'.
 */
(function () {
  'use strict';

  var DAY_MS = 86400000;

  /* ---------- internal helpers (no App dependency) ---------- */

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function addMonths(monthKey, n) {
    var y = parseInt(monthKey.slice(0, 4), 10);
    var m = parseInt(monthKey.slice(5, 7), 10);
    var t = y * 12 + (m - 1) + n;
    var ny = Math.floor(t / 12);
    var nm = (t % 12 + 12) % 12 + 1;
    return ny + '-' + pad2(nm);
  }

  function monthDiff(fromKey, toKey) {
    var fy = parseInt(fromKey.slice(0, 4), 10);
    var fm = parseInt(fromKey.slice(5, 7), 10);
    var ty = parseInt(toKey.slice(0, 4), 10);
    var tm = parseInt(toKey.slice(5, 7), 10);
    return (ty * 12 + tm) - (fy * 12 + fm);
  }

  function inMonth(tx, monthKey) {
    return typeof tx.date === 'string' && tx.date.slice(0, 7) === monthKey;
  }

  function cents(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function median(nums) {
    if (!nums.length) return 0;
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function isoToDays(iso) {
    return Date.UTC(
      parseInt(iso.slice(0, 4), 10),
      parseInt(iso.slice(5, 7), 10) - 1,
      parseInt(iso.slice(8, 10), 10)
    ) / DAY_MS;
  }

  function addDaysISO(iso, n) {
    var d = new Date(Date.UTC(
      parseInt(iso.slice(0, 4), 10),
      parseInt(iso.slice(5, 7), 10) - 1,
      parseInt(iso.slice(8, 10), 10)
    ));
    d.setUTCDate(d.getUTCDate() + n);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function todayLocalISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function currentMonthKey() {
    return todayLocalISO().slice(0, 7);
  }

  function normalizeText(s) {
    return String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
  }

  // Monthly amount of a rule. Quarterly and yearly rules are NEVER smoothed
  // over the months — they count as individual items in the months they are
  // actually debited (see availableBudget / personalSummary), so they return 0.
  function monthlyEquivCents(rule) {
    return rule.interval === 'monthly' ? cents(rule.amountCents) : 0;
  }

  /* ---------- public API ---------- */

  function monthlySummary(txs, monthKey) {
    var incomeCents = 0;
    var expenseCents = 0;
    var catMap = new Map();
    var byPayer = {
      p1: { incomeCents: 0, expenseCents: 0 },
      p2: { incomeCents: 0, expenseCents: 0 }
    };
    var list = txs || [];
    for (var i = 0; i < list.length; i++) {
      var tx = list[i];
      if (!tx || !inMonth(tx, monthKey) || tx.category === 'ausgleich') continue;
      var amt = cents(tx.amountCents);
      if (tx.type === 'income') {
        incomeCents += amt;
        if (byPayer[tx.payerId]) byPayer[tx.payerId].incomeCents += amt;
      } else if (tx.type === 'expense') {
        expenseCents += amt;
        if (byPayer[tx.payerId]) byPayer[tx.payerId].expenseCents += amt;
        var entry = catMap.get(tx.category);
        if (!entry) {
          entry = { category: tx.category, cents: 0, count: 0 };
          catMap.set(tx.category, entry);
        }
        entry.cents += amt;
        entry.count += 1;
      }
    }
    var byCategory = Array.from(catMap.values()).sort(function (a, b) { return b.cents - a.cents; });
    return {
      incomeCents: incomeCents,
      expenseCents: expenseCents,
      savedCents: incomeCents - expenseCents,
      byCategory: byCategory,
      byPayer: byPayer
    };
  }

  function trend(txs, nMonths, endMonthKey) {
    var out = [];
    var index = new Map();
    for (var i = nMonths - 1; i >= 0; i--) {
      var mk = addMonths(endMonthKey, -i);
      index.set(mk, out.length);
      out.push({ month: mk, incomeCents: 0, expenseCents: 0 });
    }
    var list = txs || [];
    for (var j = 0; j < list.length; j++) {
      var tx = list[j];
      if (!tx || tx.category === 'ausgleich' || typeof tx.date !== 'string') continue;
      var pos = index.get(tx.date.slice(0, 7));
      if (pos === undefined) continue;
      var amt = cents(tx.amountCents);
      if (tx.type === 'income') out[pos].incomeCents += amt;
      else if (tx.type === 'expense') out[pos].expenseCents += amt;
    }
    return out;
  }

  function coupleBalance(txs) {
    var paid = { p1: 0, p2: 0 };      // shared expenses fronted
    var recv = { p1: 0, p2: 0 };      // shared income received
    var settle = 0;
    var list = txs || [];
    for (var i = 0; i < list.length; i++) {
      var tx = list[i];
      if (!tx) continue;
      var amt = cents(tx.amountCents);
      if (tx.category === 'ausgleich') {
        // settlement transfer: payer pays the other partner
        if (tx.payerId === 'p2') settle -= amt;
        else if (tx.payerId === 'p1') settle += amt;
      } else if (tx.shared === true && tx.type === 'expense') {
        if (paid[tx.payerId] !== undefined) paid[tx.payerId] += amt;
      } else if (tx.shared === true && tx.type === 'income') {
        // shared income held by one partner: they owe the other half of the difference
        if (recv[tx.payerId] !== undefined) recv[tx.payerId] += amt;
      }
    }
    // net > 0: p2 owes p1. A shared expense fronted by p1 raises it; shared income
    // received by p1 lowers it (p1 must pay out half of what they hold).
    var net = ((paid.p1 - paid.p2) - (recv.p1 - recv.p2)) / 2 + settle;
    return {
      paidSharedCents: { p1: paid.p1, p2: paid.p2 },
      receivedSharedCents: { p1: recv.p1, p2: recv.p2 },
      owesCents: Math.abs(Math.round(net)),
      debtorId: net > 0 ? 'p2' : net < 0 ? 'p1' : null
    };
  }

  // Monthly fixed costs: monthly rules only. Quarterly and yearly rules are
  // excluded — they appear as individual items in their due month instead.
  function fixedMonthlyCents(rules) {
    var sum = 0;
    var list = rules || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || !r.active || r.type !== 'expense') continue;
      sum += monthlyEquivCents(r);
    }
    return Math.round(sum);
  }

  function ruleDueInMonth(rule, monthKey) {
    if (rule.interval === 'monthly') return true;
    if (rule.interval === 'quarterly') {
      var anchor = rule.anchorMonth || monthKey;
      var diff = monthDiff(anchor, monthKey);
      return diff >= 0 && diff % 3 === 0;
    }
    if (rule.interval === 'yearly') {
      var dueMonth = parseInt(rule.dueMonth, 10) || 1;
      return parseInt(monthKey.slice(5, 7), 10) === dueMonth;
    }
    return false;
  }

  function upcomingForMonth(rules, txs, monthKey, todayISO) {
    var monthTxs = (txs || []).filter(function (t) { return t && inMonth(t, monthKey); });
    var out = [];
    var list = rules || [];
    for (var i = 0; i < list.length; i++) {
      var rule = list[i];
      if (!rule || !rule.active || !ruleDueInMonth(rule, monthKey)) continue;
      var dueDay = Math.min(28, Math.max(1, parseInt(rule.dueDay, 10) || 1));
      var dueDateISO = monthKey + '-' + pad2(dueDay);

      var matched = null;
      // prefer explicit link via recurringId
      for (var j = 0; j < monthTxs.length; j++) {
        if (monthTxs[j].recurringId === rule.id) { matched = monthTxs[j]; break; }
      }
      if (!matched) {
        for (var k = 0; k < monthTxs.length; k++) {
          var tx = monthTxs[k];
          if (tx.recurringId) continue;
          if (tx.type === rule.type &&
              tx.category === rule.category &&
              Math.abs(cents(tx.amountCents) - cents(rule.amountCents)) <= cents(rule.amountCents) * 0.1) {
            matched = tx;
            break;
          }
        }
      }

      var status = matched ? 'paid' : (dueDateISO < todayISO ? 'overdue' : 'due');
      out.push({
        rule: rule,
        dueDateISO: dueDateISO,
        status: status,
        matchedTxId: matched ? matched.id : null
      });
    }
    out.sort(function (a, b) {
      return a.dueDateISO < b.dueDateISO ? -1 : a.dueDateISO > b.dueDateISO ? 1 : 0;
    });
    return out;
  }

  // "Frei verfügbar" for a month: a forward-looking, plan-based budget.
  //   plannedIncome = monthly income rules + non-rule income bookings this month
  //                   + quarterly/yearly income rules due this month
  //   fixed         = active monthly expense rules (= fixedMonthlyCents)
  //   nonMonthlyDue = quarterly + yearly expense rules due in this month, at full amount;
  //                   each one is also returned in nonMonthlyItems so the UI lists it
  //                   individually (never smoothed over the other months)
  //   variableSpent = expense bookings this month that are NOT part of a fixed-cost rule
  //   available     = plannedIncome − fixed − nonMonthlyDue − variableSpent
  // Bookings that belong to a rule (explicit recurringId link OR fuzzy match, same logic as
  // upcomingForMonth) are excluded from the booking loop so a fixed cost is never counted twice.
  // Per person: shared rules/bookings are split 50/50, everything else goes to its payer.
  function availableBudget(txs, rules, monthKey) {
    var ruleList = rules || [];
    var txList = txs || [];

    var total = { plannedIncome: 0, fixed: 0, nonMonthlyDue: 0, variableSpent: 0 };
    var per = {
      p1: { plannedIncome: 0, fixed: 0, nonMonthlyDue: 0, variableSpent: 0 },
      p2: { plannedIncome: 0, fixed: 0, nonMonthlyDue: 0, variableSpent: 0 }
    };
    var nonMonthlyItems = [];

    function add(field, amt, payerId, shared) {
      total[field] += amt;
      if (shared === true) {
        per.p1[field] += amt / 2;
        per.p2[field] += amt / 2;
      } else if (per[payerId]) {
        per[payerId][field] += amt;
      }
    }

    for (var i = 0; i < ruleList.length; i++) {
      var r = ruleList[i];
      if (!r || !r.active) continue;
      var isShared = r.shared === true;
      if (r.interval !== 'monthly') {
        if (!ruleDueInMonth(r, monthKey)) continue;
        var amt = cents(r.amountCents);
        if (r.type === 'income') {
          add('plannedIncome', amt, r.payerId, isShared);
        } else if (r.type === 'expense') {
          add('nonMonthlyDue', amt, r.payerId, isShared);
          nonMonthlyItems.push({
            id: r.id,
            name: r.name,
            amountCents: amt,
            category: r.category,
            interval: r.interval,
            payerId: r.payerId,
            shared: isShared
          });
        }
      } else {
        var eq = monthlyEquivCents(r);
        if (r.type === 'income') add('plannedIncome', eq, r.payerId, isShared);
        else if (r.type === 'expense') add('fixed', eq, r.payerId, isShared);
      }
    }

    // tx ids already represented by a rule (same matching as the dashboard's "Bezahlt")
    var matched = new Set();
    upcomingForMonth(ruleList, txList, monthKey, '0000-00-00').forEach(function (item) {
      if (item.matchedTxId) matched.add(item.matchedTxId);
    });

    for (var j = 0; j < txList.length; j++) {
      var tx = txList[j];
      if (!tx || !inMonth(tx, monthKey) || tx.category === 'ausgleich') continue;
      if (tx.recurringId || matched.has(tx.id)) continue;
      var txAmt = cents(tx.amountCents);
      if (tx.type === 'income') add('plannedIncome', txAmt, tx.payerId, tx.shared === true);
      else if (tx.type === 'expense') add('variableSpent', txAmt, tx.payerId, tx.shared === true);
    }

    function finalize(o) {
      var pi = Math.round(o.plannedIncome);
      var fx = Math.round(o.fixed);
      var nm = Math.round(o.nonMonthlyDue);
      var vs = Math.round(o.variableSpent);
      return {
        plannedIncomeCents: pi,
        fixedCents: fx,
        nonMonthlyDueCents: nm,
        variableSpentCents: vs,
        availableCents: pi - fx - nm - vs
      };
    }

    return {
      total: finalize(total),
      byPerson: { p1: finalize(per.p1), p2: finalize(per.p2) },
      nonMonthlyItems: nonMonthlyItems
    };
  }

  // Per-person view ("Persönlich"): that person's income, their fixed costs, and their
  // private expenses for the month. Shared rules and shared bookings count HALF for
  // each partner, regardless of who pays them. Quarterly and yearly rules are not
  // smoothed — they count (at the person's share) in their due month only. Recurring
  // private expenses are counted under private expenses instead of fixed costs.
  // 'ausgleich' is ignored.
  function personalSummary(txs, rules, personId, monthKey) {
    var rl = rules || [];
    var list = txs || [];

    var recurringIncome = 0;
    var fixed = 0;
    var recurringPrivateExpense = 0;
    var nonMonthlyDue = 0;
    var nonMonthlyItems = [];

    // every rule this person carries (in part): own rules fully, shared rules half
    var relevantRules = [];
    for (var j = 0; j < rl.length; j++) {
      var r = rl[j];
      if (!r || !r.active) continue;
      var share = r.shared === true ? 0.5 : (r.payerId === personId ? 1 : 0);
      if (share === 0) continue;
      relevantRules.push(r);
      if (r.interval !== 'monthly') {
        if (!ruleDueInMonth(r, monthKey)) continue;
        var amt = cents(r.amountCents) * share;
        if (r.type === 'income') {
          recurringIncome += amt;
        } else if (r.type === 'expense') {
          nonMonthlyDue += amt;
          nonMonthlyItems.push({
            id: r.id,
            name: r.name,
            shareCents: Math.round(amt),
            interval: r.interval,
            shared: r.shared === true
          });
        }
      } else {
        var eq = monthlyEquivCents(r) * share;
        if (r.type === 'income') recurringIncome += eq;
        else if (r.type === 'expense' && r.privateExpense === true) recurringPrivateExpense += eq;
        else if (r.type === 'expense') fixed += eq;
      }
    }

    // tx ids already represented by one of these rules, so they are not
    // counted on top of the rule amount.
    var relevantTxs = list.filter(function (tx) {
      return tx && (tx.payerId === personId || tx.shared === true);
    });
    var matched = new Set();
    upcomingForMonth(relevantRules, relevantTxs, monthKey, '0000-00-00').forEach(function (item) {
      if (item.matchedTxId) matched.add(item.matchedTxId);
    });

    // non-rule bookings this month: own income + own private expenses at full
    // amount, shared income/expenses at half (whoever paid them).
    var oneOffIncome = 0;
    var privateExpenseCents = 0;
    var sharedVariable = 0;
    for (var i = 0; i < list.length; i++) {
      var tx = list[i];
      if (!tx || tx.category === 'ausgleich') continue;
      if (!inMonth(tx, monthKey) || tx.recurringId) continue;
      if (matched.has(tx.id)) continue;
      var isSharedTx = tx.shared === true;
      if (!isSharedTx && tx.payerId !== personId) continue;
      var txAmt = cents(tx.amountCents);
      if (tx.type === 'income') {
        oneOffIncome += isSharedTx ? txAmt / 2 : txAmt;
      } else if (tx.type === 'expense') {
        if (isSharedTx) sharedVariable += txAmt / 2;
        else privateExpenseCents += txAmt;
      }
    }

    var incomeCents = Math.round(recurringIncome + oneOffIncome);
    fixed = Math.round(fixed);
    nonMonthlyDue = Math.round(nonMonthlyDue);
    privateExpenseCents = Math.round(privateExpenseCents + recurringPrivateExpense);
    var sharedVariableCents = Math.round(sharedVariable);

    return {
      incomeCents: incomeCents,
      fixedCents: fixed,
      nonMonthlyDueCents: nonMonthlyDue,
      nonMonthlyItems: nonMonthlyItems,
      privateExpenseCents: privateExpenseCents,
      sharedVariableCents: sharedVariableCents,
      leftoverCents: incomeCents - fixed - nonMonthlyDue - privateExpenseCents - sharedVariableCents
    };
  }

  // Running total of monthly savings (income − expense) over the window → "Sparverlauf".
  function cumulativeSavings(txs, nMonths, endMonthKey) {
    var t = trend(txs, nMonths, endMonthKey);
    var run = 0;
    return t.map(function (m) {
      var saved = m.incomeCents - m.expenseCents;
      run += saved;
      return { month: m.month, savedCents: saved, cumulativeCents: run };
    });
  }

  // Headline analytics figures.
  function keyMetrics(txs, rules, monthKey) {
    var n = 6;
    var t = trend(txs, n, monthKey);
    var totalExp = 0, rateSum = 0, rateCount = 0;
    t.forEach(function (m) {
      totalExp += m.expenseCents;
      if (m.incomeCents > 0) {
        rateSum += (m.incomeCents - m.expenseCents) / m.incomeCents;
        rateCount += 1;
      }
    });
    var sum = monthlySummary(txs, monthKey);
    var fixed = fixedMonthlyCents(rules);
    var biggest = null;
    (txs || []).forEach(function (tx) {
      if (!tx || tx.type !== 'expense' || tx.category === 'ausgleich' || !inMonth(tx, monthKey)) return;
      if (!biggest || cents(tx.amountCents) > cents(biggest.amountCents)) biggest = tx;
    });
    return {
      avgExpenseCents: Math.round(totalExp / n),
      avgSavingsRate: rateCount ? Math.round((rateSum / rateCount) * 100) : 0,
      fixedSharePct: sum.incomeCents > 0 ? Math.round((fixed / sum.incomeCents) * 100) : 0,
      biggest: biggest
    };
  }

  // Largest single expenses of the month.
  function topExpenses(txs, monthKey, n) {
    var list = (txs || []).filter(function (tx) {
      return tx && tx.type === 'expense' && tx.category !== 'ausgleich' && inMonth(tx, monthKey);
    }).slice();
    list.sort(function (a, b) { return cents(b.amountCents) - cents(a.amountCents); });
    return list.slice(0, n || 5);
  }

  // Split of the month's expenses into shared vs private.
  function sharedVsPrivate(txs, monthKey) {
    var shared = 0, priv = 0;
    (txs || []).forEach(function (tx) {
      if (!tx || tx.type !== 'expense' || tx.category === 'ausgleich' || !inMonth(tx, monthKey)) return;
      if (tx.shared === true) shared += cents(tx.amountCents);
      else priv += cents(tx.amountCents);
    });
    return { sharedCents: shared, privateCents: priv };
  }

  function detectRecurring(txs, rules, dismissedKeys) {
    var dismissed = new Set(Array.isArray(dismissedKeys) ? dismissedKeys : []);
    var groups = new Map();
    var list = txs || [];

    for (var i = 0; i < list.length; i++) {
      var tx = list[i];
      if (!tx || tx.type !== 'expense' || tx.recurringId || tx.category === 'ausgleich') continue;
      var raw = normalizeText(tx.note);
      if (!raw) continue;
      var norm = raw.toLowerCase();
      var arr = groups.get(norm);
      if (!arr) { arr = []; groups.set(norm, arr); }
      arr.push(tx);
    }

    var results = [];
    groups.forEach(function (groupTxs, norm) {
      if (groupTxs.length < 2) return;

      var med = median(groupTxs.map(function (t) { return cents(t.amountCents); }));
      if (med <= 0) return;
      var members = groupTxs.filter(function (t) {
        return Math.abs(cents(t.amountCents) - med) <= med * 0.1;
      });
      if (members.length < 2) return;

      members.sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
      var gaps = [];
      for (var g = 1; g < members.length; g++) {
        gaps.push(isoToDays(members[g].date) - isoToDays(members[g - 1].date));
      }
      var medGap = median(gaps);
      var interval = null;
      if (medGap >= 25 && medGap <= 35) interval = 'monthly';
      else if (medGap >= 80 && medGap <= 100) interval = 'quarterly';
      else if (medGap >= 330 && medGap <= 400) interval = 'yearly';
      if (!interval) return;

      var key = norm + '|' + interval;
      if (dismissed.has(key)) return;

      var amountCents = Math.round(median(members.map(function (t) { return cents(t.amountCents); })));

      // most frequent category among members
      var catCounts = new Map();
      members.forEach(function (t) {
        catCounts.set(t.category, (catCounts.get(t.category) || 0) + 1);
      });
      var category = 'sonstiges';
      var bestCount = 0;
      catCounts.forEach(function (n, k) {
        if (n > bestCount) { bestCount = n; category = k; }
      });

      // skip if an existing rule already covers this
      var conflict = (rules || []).some(function (r) {
        if (!r) return false;
        if (normalizeText(r.name).toLowerCase() === norm) return true;
        return r.category === category &&
          Math.abs(cents(r.amountCents) - amountCents) <= cents(r.amountCents) * 0.1;
      });
      if (conflict) return;

      var dueDay = Math.min(28, Math.max(1, Math.round(median(
        members.map(function (t) { return parseInt(t.date.slice(8, 10), 10); })
      ))));

      var last = members[members.length - 1];
      var rawName = normalizeText(last.note);
      var name = rawName.charAt(0).toUpperCase() + rawName.slice(1);

      results.push({
        key: key,
        name: name,
        amountCents: amountCents,
        category: category,
        interval: interval,
        dueDay: dueDay,
        count: members.length,
        lastDate: last.date
      });
    });

    results.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0;
    });
    return results.slice(0, 5);
  }

  function categoryCents(summary, key) {
    for (var i = 0; i < summary.byCategory.length; i++) {
      if (summary.byCategory[i].category === key) return summary.byCategory[i].cents;
    }
    return 0;
  }

  function tips(txs, rules) {
    var out = [];
    var curKey = currentMonthKey();
    var prevKey = addMonths(curKey, -1);
    var sumCur = monthlySummary(txs, curKey);
    var sumPrev = monthlySummary(txs, prevKey);
    var hasData = (txs || []).some(function (t) { return t && t.category !== 'ausgleich'; });

    // 1. Abo check: active monthly expense rules in abos + internet
    var aboMonthly = 0;
    (rules || []).forEach(function (r) {
      if (r && r.active && r.type === 'expense' && r.interval === 'monthly' &&
          (r.category === 'abos' || r.category === 'internet')) {
        aboMonthly += cents(r.amountCents);
      }
    });
    if (aboMonthly > 0) {
      var aboYearly = aboMonthly * 12;
      var aboWarn = aboYearly > 60000;
      out.push({
        emoji: '📺',
        title: 'Abo-Check',
        text: 'Deine Abos kosten dich ' + App.fmtEUR(aboYearly) + ' im Jahr (' + App.fmtEUR(aboMonthly) + ' pro Monat).' +
          (aboWarn ? ' Geht die Liste mal gemeinsam durch – braucht ihr wirklich alle?' : ''),
        tone: aboWarn ? 'warn' : 'info'
      });
    }

    // 2. Savings rate current month
    if (sumCur.incomeCents > 0) {
      var rate = sumCur.savedCents / sumCur.incomeCents;
      var ratePct = Math.round(rate * 100);
      if (rate < 0.10) {
        out.push({
          emoji: '📉',
          title: 'Sparquote niedrig',
          text: sumCur.savedCents < 0
            ? 'Du gibst diesen Monat ' + App.fmtEUR(-sumCur.savedCents) + ' mehr aus, als reinkommt. Schau, wo du gegensteuern kannst.'
            : 'Diesen Monat bleiben dir nur ' + ratePct + ' % deiner Einnahmen übrig. Versuch, mindestens 10 % zur Seite zu legen.',
          tone: 'warn'
        });
      } else if (rate > 0.25) {
        out.push({
          emoji: '💪',
          title: 'Starke Sparquote',
          text: 'Du legst diesen Monat ' + ratePct + ' % deiner Einnahmen zurück – richtig gut!',
          tone: 'good'
        });
      }
    }

    // 3. Biggest category jump vs previous month (≥30 % and ≥30 €)
    var prevByCat = new Map();
    sumPrev.byCategory.forEach(function (c) { prevByCat.set(c.category, c.cents); });
    var jump = null;
    sumCur.byCategory.forEach(function (c) {
      var prevC = prevByCat.get(c.category) || 0;
      if (prevC <= 0) return;
      var inc = c.cents - prevC;
      if (inc >= 3000 && inc >= prevC * 0.3) {
        if (!jump || inc > jump.inc) jump = { category: c.category, cur: c.cents, prev: prevC, inc: inc };
      }
    });
    if (jump) {
      var jumpCat = App.cat(jump.category);
      var jumpPct = Math.round((jump.inc / jump.prev) * 100);
      out.push({
        emoji: jumpCat.emoji,
        title: jumpCat.label + ' gestiegen',
        text: 'Für ' + jumpCat.label + ' hast du diesen Monat ' + App.fmtEUR(jump.cur) +
          ' ausgegeben – ' + jumpPct + ' % mehr als im Vormonat (' + App.fmtEUR(jump.prev) + ').',
        tone: 'warn'
      });
    }

    // 4. Many small purchases (< 5 €) in current month
    var smallCount = 0;
    var smallSum = 0;
    (txs || []).forEach(function (t) {
      if (t && t.type === 'expense' && t.category !== 'ausgleich' &&
          inMonth(t, curKey) && cents(t.amountCents) < 500) {
        smallCount += 1;
        smallSum += cents(t.amountCents);
      }
    });
    if (smallCount >= 12) {
      out.push({
        emoji: '🪙',
        title: 'Viele Kleinbeträge',
        text: smallCount + ' kleine Ausgaben unter 5 € summieren sich diesen Monat auf ' + App.fmtEUR(smallSum) + '.',
        tone: 'info'
      });
    }

    // 5. Restaurant vs Lebensmittel in current month
    var restC = categoryCents(sumCur, 'restaurant');
    var lebenC = categoryCents(sumCur, 'lebensmittel');
    if (lebenC > 0 && restC > 10000 && restC > lebenC * 0.6) {
      out.push({
        emoji: '🍽️',
        title: 'Oft auswärts gegessen',
        text: 'Du hast diesen Monat ' + App.fmtEUR(restC) + ' für Restaurant & Café ausgegeben – bei ' +
          App.fmtEUR(lebenC) + ' für Lebensmittel. Öfter selbst kochen spart bares Geld.',
        tone: 'info'
      });
    }

    // 6. Fixed-cost share of current income > 50 %
    var fixed = fixedMonthlyCents(rules);
    if (sumCur.incomeCents > 0 && fixed > sumCur.incomeCents * 0.5) {
      var fixedPct = Math.round((fixed / sumCur.incomeCents) * 100);
      out.push({
        emoji: '🏠',
        title: 'Hohe Fixkosten',
        text: 'Eure Fixkosten von ' + App.fmtEUR(fixed) + ' im Monat machen ' + fixedPct +
          ' % eurer Einnahmen aus. Prüft, ob sich Verträge oder Tarife optimieren lassen.',
        tone: 'warn'
      });
    }

    // 7. Positive fallback
    if (out.length === 0 && hasData) {
      out.push({
        emoji: '✅',
        title: 'Alles im grünen Bereich',
        text: 'Keine Auffälligkeiten gefunden – eure Finanzen sehen gut aus. Weiter so!',
        tone: 'good'
      });
    }

    return out.slice(0, 6);
  }

  /* ---------- ICS export (RFC 5545) ---------- */

  function escapeICS(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  function utf8Len(cp) {
    return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }

  // Fold a content line to <= 75 octets per RFC 5545 §3.1 (continuation lines
  // begin with a single space and may carry 74 octets of content).
  function foldLine(line) {
    var chunks = [];
    var cur = '';
    var budget = 75;
    for (var i = 0; i < line.length;) {
      var cp = line.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      var len = utf8Len(cp);
      if (cur !== '' && len > budget) {
        chunks.push(cur);
        cur = '';
        budget = 74;
      }
      cur += ch;
      budget -= len;
      i += ch.length;
    }
    if (cur !== '') chunks.push(cur);
    return chunks.map(function (c, idx) { return idx === 0 ? c : ' ' + c; }).join('\r\n');
  }

  function nextDueDateISO(rule, todayISO) {
    var day = Math.min(28, Math.max(1, parseInt(rule.dueDay, 10) || 1));
    var curMonth = todayISO.slice(0, 7);

    if (rule.interval === 'yearly') {
      var month = Math.min(12, Math.max(1, parseInt(rule.dueMonth, 10) || 1));
      var year = parseInt(todayISO.slice(0, 4), 10);
      var iso = year + '-' + pad2(month) + '-' + pad2(day);
      if (iso < todayISO) iso = (year + 1) + '-' + pad2(month) + '-' + pad2(day);
      return iso;
    }
    if (rule.interval === 'quarterly') {
      var mk = rule.anchorMonth || curMonth;
      var diff = monthDiff(mk, curMonth);
      if (diff > 0) mk = addMonths(mk, Math.ceil(diff / 3) * 3);
      var qIso = mk + '-' + pad2(day);
      if (qIso < todayISO) qIso = addMonths(mk, 3) + '-' + pad2(day);
      return qIso;
    }
    // monthly
    var mIso = curMonth + '-' + pad2(day);
    if (mIso < todayISO) mIso = addMonths(curMonth, 1) + '-' + pad2(day);
    return mIso;
  }

  function icsForRules(rules, members) {
    var today = todayLocalISO();
    var now = new Date();
    var dtstamp = now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) +
      'T' + pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + 'Z';

    var memberName = function (id) {
      var m = (members || []).filter(function (x) { return x && x.id === id; })[0];
      return m && m.name ? String(m.name) : '';
    };

    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Unsere Finanzen//Fixkosten//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Fixkosten'
    ];

    (rules || []).forEach(function (rule) {
      if (!rule || !rule.active) return;

      var dueISO = nextDueDateISO(rule, today);
      var dtStart = dueISO.replace(/-/g, '');
      var dtEnd = addDaysISO(dueISO, 1).replace(/-/g, '');
      var day = Math.min(28, Math.max(1, parseInt(rule.dueDay, 10) || 1));

      var rrule;
      var intervalWord;
      if (rule.interval === 'quarterly') {
        rrule = 'RRULE:FREQ=MONTHLY;INTERVAL=3';
        intervalWord = 'vierteljährlich';
      } else if (rule.interval === 'yearly') {
        rrule = 'RRULE:FREQ=YEARLY';
        intervalWord = 'jährlich';
      } else {
        rrule = 'RRULE:FREQ=MONTHLY;BYMONTHDAY=' + day;
        intervalWord = 'monatlich';
      }

      var cat = App.cat(rule.category);
      var payerName = memberName(rule.payerId);
      var summary = '💶 ' + String(rule.name || '') + ' – ' + App.fmtEUR(cents(rule.amountCents));
      var description = (rule.type === 'income' ? 'Einnahme'
        : (rule.privateExpense === true ? 'Private Ausgabe' : 'Fixkosten')) +
        ' · Kategorie: ' + cat.label +
        ' · ' + intervalWord +
        (payerName ? ' · Zahler/in: ' + payerName : '');

      lines.push(
        'BEGIN:VEVENT',
        'UID:' + rule.id + '@unsere-finanzen',
        'DTSTAMP:' + dtstamp,
        'DTSTART;VALUE=DATE:' + dtStart,
        'DTEND;VALUE=DATE:' + dtEnd,
        rrule,
        'SUMMARY:' + escapeICS(summary),
        'DESCRIPTION:' + escapeICS(description),
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:' + escapeICS('Erinnerung: ' + String(rule.name || '')),
        'TRIGGER:-PT15H',
        'END:VALARM',
        'END:VEVENT'
      );
    });

    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  window.Analysis = {
    monthlySummary: monthlySummary,
    trend: trend,
    coupleBalance: coupleBalance,
    fixedMonthlyCents: fixedMonthlyCents,
    upcomingForMonth: upcomingForMonth,
    availableBudget: availableBudget,
    personalSummary: personalSummary,
    cumulativeSavings: cumulativeSavings,
    keyMetrics: keyMetrics,
    topExpenses: topExpenses,
    sharedVsPrivate: sharedVsPrivate,
    detectRecurring: detectRecurring,
    tips: tips,
    icsForRules: icsForRules
  };
})();
