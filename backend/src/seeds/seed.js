import bcrypt from 'bcryptjs';
import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../config/db.js';

import { users, groups, people, expenses, expenseSplits, payments, passwordResets } from '../models/index.js';
import { createGroupWithHost } from '../services/groupService.js';
import { processSplits } from '../services/splitService.js';
import { calculateGroupBalances } from '../services/balanceService.js';
import { hashToken } from '../services/tokenService.js';
import { hashRecoveryCode, hashResetToken } from '../services/recoveryService.js';

async function seed() {
  console.log('🌱 Starting SplitOrbit seed script...');

  // Clean existing data
  await db.execute(sql`
    TRUNCATE TABLE 
      audit_logs, 
      password_resets,
      payments, 
      expense_splits, 
      expenses, 
      people, 
      groups, 
      users 
    CASCADE;
  `);

  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('adminpassword123', salt);
  const hostPasswordHash = await bcrypt.hash('hostpassword123', salt);
  const friendPasswordHash = await bcrypt.hash('friendpassword123', salt);

  // 1. Create Demo Admin
  const [admin] = await db
    .insert(users)
    .values({
      name: 'Platform Admin',
      username: 'admin',
      email: 'admin@splitorbit.com',
      passwordHash: adminPasswordHash,
      role: 'admin',
      isActive: true,
      tokenVersion: 0,
    })
    .returning();
  console.log('✅ Created Admin:', admin.username);

  // 2. Create Demo Host
  const [host] = await db
    .insert(users)
    .values({
      name: 'Vikram Host',
      username: 'vikram',
      email: 'host@splitorbit.com',
      passwordHash: hostPasswordHash,
      role: 'user',
      isActive: true,
      tokenVersion: 0,
    })
    .returning();
  console.log('✅ Created Host:', host.username);

  // 3. Create Demo Friend User
  const [friendUser] = await db
    .insert(users)
    .values({
      name: 'Karan Patel',
      username: 'karan',
      email: 'friend@splitorbit.com',
      passwordHash: friendPasswordHash,
      role: 'user',
      isActive: true,
      tokenVersion: 0,
    })
    .returning();
  console.log('✅ Created Friend User:', friendUser.username);

  // 4. Create Demo Group with Host Person
  const { group, hostPerson } = await createGroupWithHost({
    name: 'Manali Road Trip 🏔️',
    date: new Date('2026-09-15T10:00:00Z'),
    description: '4-day road trip to Solang Valley and Old Manali with friends',
    user: host,
    ipAddress: '127.0.0.1',
  });
  console.log('✅ Created Group:', group.name, 'with Host Person:', hostPerson.name);

  // 5. Add 4 Friends (with demo link tokens and claimed account)
  const [aarav] = await db
    .insert(people)
    .values({
      groupId: group.id,
      name: 'Aarav Sharma',
      phone: '+91 98765 43210',
      note: 'Booked the SUV',
      isHost: false,
      shareTokenHash: hashToken('demo-share-token-aarav'),
      shareEnabled: true,
    })
    .returning();

  // Valid Invite
  const [neha] = await db
    .insert(people)
    .values({
      groupId: group.id,
      name: 'Neha Verma',
      phone: '+91 98765 43211',
      note: 'Arranged photography',
      isHost: false,
      inviteCodeHash: hashToken('DEMO-VALID-INVITE'),
      inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();

  // Used / Claimed Invite (Linked to User Account)
  const [karan] = await db
    .insert(people)
    .values({
      groupId: group.id,
      name: 'Karan Patel',
      phone: '+91 98765 43212',
      note: 'Managed snacks & music',
      isHost: false,
      linkedUserId: friendUser.id,
    })
    .returning();

  const [ananya] = await db
    .insert(people)
    .values({
      groupId: group.id,
      name: 'Ananya Iyer',
      phone: '+91 98765 43213',
      note: 'Campfire coordinator',
      isHost: false,
    })
    .returning();

  // Expired Invite
  const [pooja] = await db
    .insert(people)
    .values({
      groupId: group.id,
      name: 'Pooja Expired',
      phone: '+91 98765 43214',
      note: 'Pending invite that passed its expiration date',
      isHost: false,
      inviteCodeHash: hashToken('DEMO-EXPIRED-INVITE'),
      inviteExpiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    })
    .returning();

  // Revoked Share Link
  const [dev] = await db
    .insert(people)
    .values({
      groupId: group.id,
      name: 'Dev Revoked',
      phone: '+91 98765 43215',
      note: 'Previous view link was revoked by the host',
      isHost: false,
      shareTokenHash: hashToken('demo-revoked-share-token'),
      shareEnabled: false,
    })
    .returning();

  // Admin-generated Password Reset Ticket for Karan (@karan)
  const demoResetToken = 'demo-admin-reset-token-karan';
  const demoResetCodeRaw = 'K7M29QXP'; // formatted: K7M2-9QXP
  await db.insert(passwordResets).values({
    userId: friendUser.id,
    tokenHash: hashResetToken(demoResetToken),
    codeHash: hashRecoveryCode(demoResetCodeRaw),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdByAdminId: admin.id,
  });

  const friendPersons = [aarav, neha, karan, ananya];
  console.log(`✅ Added friends to group (Karan claimed, Aarav valid share, Dev revoked share, Neha valid invite, Pooja expired invite)`);

  const allMembers = [hostPerson, ...friendPersons];

  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const dateMinus20 = new Date(nowMs - 20 * dayMs);
  const dateMinus10 = new Date(nowMs - 10 * dayMs);
  const dateMinus6 = new Date(nowMs - 6 * dayMs);
  const dateMinus2 = new Date(nowMs - 2 * dayMs);
  const dateMinus7 = new Date(nowMs - 7 * dayMs);
  const dateMinus5 = new Date(nowMs - 5 * dayMs);
  const dateMinus4 = new Date(nowMs - 4 * dayMs);
  const dateMinus3 = new Date(nowMs - 3 * dayMs);
  const dateMinus1 = new Date(nowMs - 1 * dayMs);

  // 5. Add Expense 1: Percentage Split (Cottage Booking - ₹20,000, 20 days ago, old unpaid due)
  const percentageSplitsInput = [
    { personId: hostPerson.id, basisPoints: 2000 }, // 20.00%
    { personId: friendPersons[0].id, basisPoints: 2000 }, // 20.00%
    { personId: friendPersons[1].id, basisPoints: 2000 }, // 20.00%
    { personId: friendPersons[2].id, basisPoints: 2000 }, // 20.00%
    { personId: friendPersons[3].id, basisPoints: 2000 }, // 20.00%
  ];

  const [exp1] = await db
    .insert(expenses)
    .values({
      groupId: group.id,
      title: 'Pine Forest Cottage Booking 🏡',
      totalAmount: 2000000,
      date: dateMinus20,
      paidByPersonId: hostPerson.id,
      description: 'Wooden cottage for 3 nights with mountain view',
      splitType: 'percentage',
      createdBy: host.id,
    })
    .returning();

  const splits1 = processSplits('percentage', 2000000, percentageSplitsInput);
  await db.insert(expenseSplits).values(
    splits1.map((s) => ({
      expenseId: exp1.id,
      groupId: group.id,
      personId: s.personId,
      amount: s.amount,
      basisPoints: s.basisPoints,
    }))
  );
  console.log('✅ Added Percentage Split Expense: ₹20,000 (Cottage, 20 days ago)');

  // 6. Add Expense 2: Equal Split (SUV Rental - ₹12,000, 10 days ago)
  const [exp2] = await db
    .insert(expenses)
    .values({
      groupId: group.id,
      title: 'SUV Car Rental & Fuel 🚙',
      totalAmount: 1200000,
      date: dateMinus10,
      paidByPersonId: hostPerson.id,
      description: 'Toyota Fortuner rental including toll charges',
      splitType: 'equal',
      createdBy: host.id,
    })
    .returning();

  const splits2 = processSplits('equal', 1200000, [], allMembers.map((m) => m.id));
  await db.insert(expenseSplits).values(
    splits2.map((s) => ({
      expenseId: exp2.id,
      groupId: group.id,
      personId: s.personId,
      amount: s.amount,
    }))
  );
  console.log('✅ Added Equal Split Expense: ₹12,000 (SUV Rental, 10 days ago)');

  // 7. Add Expense 3: Exact Split (Riverside Cafe Dinner - ₹5,450, 6 days ago, paid by Aarav)
  const exactSplitsInput = [
    { personId: hostPerson.id, amount: 110000 }, // ₹1,100
    { personId: friendPersons[0].id, amount: 120000 }, // ₹1,200 (Aarav)
    { personId: friendPersons[1].id, amount: 95000 }, // ₹950 (Neha)
    { personId: friendPersons[2].id, amount: 120000 }, // ₹1,200 (Karan)
    { personId: friendPersons[3].id, amount: 100000 }, // ₹1,000 (Ananya)
  ];

  const [exp3] = await db
    .insert(expenses)
    .values({
      groupId: group.id,
      title: 'Riverside Cafe Dinner 🍲',
      totalAmount: 545000,
      date: dateMinus6,
      paidByPersonId: friendPersons[0].id, // Aarav fronted
      description: 'Trout fish, pasta, hot chocolate and desserts by the river',
      splitType: 'exact',
      createdBy: host.id,
    })
    .returning();

  const splits3 = processSplits('exact', 545000, exactSplitsInput);
  await db.insert(expenseSplits).values(
    splits3.map((s) => ({
      expenseId: exp3.id,
      groupId: group.id,
      personId: s.personId,
      amount: s.amount,
      exactAmount: s.exactAmount,
    }))
  );
  console.log('✅ Added Exact Split Expense: ₹5,450 (Riverside Cafe, 6 days ago)');

  // 8. Add Expense 4: Equal Split (Paragliding & Adventure Gear - ₹7,500, 2 days ago)
  const [exp4] = await db
    .insert(expenses)
    .values({
      groupId: group.id,
      title: 'Paragliding & Adventure Gear 🪂',
      totalAmount: 750000,
      date: dateMinus2,
      paidByPersonId: hostPerson.id,
      description: 'Tandem paragliding passes in Solang Valley',
      splitType: 'equal',
      createdBy: host.id,
    })
    .returning();

  const splits4 = processSplits('equal', 750000, [], allMembers.map((m) => m.id));
  await db.insert(expenseSplits).values(
    splits4.map((s) => ({
      expenseId: exp4.id,
      groupId: group.id,
      personId: s.personId,
      amount: s.amount,
    }))
  );
  console.log('✅ Added Equal Split Expense: ₹7,500 (Paragliding, 2 days ago)');

  // 9. Add Payments across all statuses and both modes
  // Payment 1: Accepted Online (Neha Verma -> Vikram Host ₹3,000, 7 days ago)
  await db.insert(payments).values({
    groupId: group.id,
    fromPersonId: friendPersons[1].id,
    toPersonId: hostPerson.id,
    amount: 300000,
    date: dateMinus7,
    mode: 'online',
    description: 'Partial advance repayment via Google Pay',
    reference: 'UPI/MANALI/298341908',
    status: 'accepted',
    createdByType: 'host',
    decidedBy: host.id,
    decidedAt: new Date(dateMinus7.getTime() + 5 * 60 * 1000),
  });
  console.log('✅ Added Accepted Online Payment: ₹3,000 (Neha -> Vikram)');

  // Payment 2: Accepted Cash (Aarav Sharma -> Vikram Host ₹1,000, 5 days ago)
  await db.insert(payments).values({
    groupId: group.id,
    fromPersonId: friendPersons[0].id,
    toPersonId: hostPerson.id,
    amount: 100000,
    date: dateMinus5,
    mode: 'cash',
    description: 'Handed over cash at highway toll plaza',
    reference: 'CASH/TOLL/1000',
    status: 'accepted',
    createdByType: 'host',
    decidedBy: host.id,
    decidedAt: new Date(dateMinus5.getTime() + 10 * 60 * 1000),
  });
  console.log('✅ Added Accepted Cash Payment: ₹1,000 (Aarav -> Vikram)');

  // Payment 3: Voided Payment (Duplicate Online from Neha, soft-deleted is_deleted=true, 4 days ago)
  await db.insert(payments).values({
    groupId: group.id,
    fromPersonId: friendPersons[1].id,
    toPersonId: hostPerson.id,
    amount: 120000,
    date: dateMinus4,
    mode: 'online',
    description: 'Duplicate UPI transfer attempt',
    reference: 'UPI/NEHA/DUP1200',
    status: 'accepted',
    isDeleted: true,
    createdByType: 'friend',
    decidedBy: host.id,
    decidedAt: dateMinus4,
  });
  console.log('✅ Added Voided Payment: ₹1,200 (is_deleted=true)');


  // Payment 4: Pending Online (Karan Patel -> Vikram Host ₹2,500, 3 days ago)
  await db.insert(payments).values({
    groupId: group.id,
    fromPersonId: friendPersons[2].id,
    toPersonId: hostPerson.id,
    amount: 250000,
    date: dateMinus3,
    mode: 'online',
    description: 'Repayment for cottage and dinner via PhonePe',
    reference: 'UPI/KARAN/891237190',
    status: 'pending',
    createdByType: 'friend',
  });
  console.log('✅ Added Pending Online Payment: ₹2,500 (Karan -> Vikram)');

  // Payment 5: Rejected Cash (Ananya Iyer -> Vikram Host ₹1,500, 1 day ago)
  await db.insert(payments).values({
    groupId: group.id,
    fromPersonId: friendPersons[3].id,
    toPersonId: hostPerson.id,
    amount: 150000,
    date: dateMinus1,
    mode: 'cash',
    description: 'Handed over cash during cafe checkout',
    status: 'rejected',
    rejectReason: 'Cash was mistakenly given to driver, not received by host.',
    createdByType: 'friend',
    decidedBy: host.id,
    decidedAt: new Date(dateMinus1.getTime() + 60 * 60 * 1000),
  });
  console.log('✅ Added Rejected Cash Payment: ₹1,500 (Ananya -> Vikram)');

  // 10. Create Demo Settled Group (Weekend Getaway 🏖️)
  const { group: settledGroup, hostPerson: settledHostPerson } = await createGroupWithHost({
    name: 'Goa Weekend Getaway 🏖️',
    date: new Date(nowMs - 14 * dayMs),
    description: 'Quick weekend beach trip to Baga and Anjuna',
    user: host,
    ipAddress: '127.0.0.1',
  });

  const [settledFriendPerson] = await db
    .insert(people)
    .values({
      groupId: settledGroup.id,
      name: 'Karan Patel',
      phone: '+91 98765 43212',
      isHost: false,
      linkedUserId: friendUser.id,
    })
    .returning();

  const [settledExp] = await db
    .insert(expenses)
    .values({
      groupId: settledGroup.id,
      title: 'Beach Shack Seafood Dinner 🦞',
      totalAmount: 300000,
      date: new Date(nowMs - 12 * dayMs),
      paidByPersonId: settledHostPerson.id,
      description: 'Prawn curry, fried calamari and coconut water',
      splitType: 'equal',
      createdBy: host.id,
    })
    .returning();

  const settledSplits = processSplits('equal', 300000, [], [settledHostPerson.id, settledFriendPerson.id]);
  await db.insert(expenseSplits).values(
    settledSplits.map((s) => ({
      expenseId: settledExp.id,
      groupId: settledGroup.id,
      personId: s.personId,
      amount: s.amount,
    }))
  );

  // Karan pays ₹1,500 accepted to Vikram, settling the group completely
  await db.insert(payments).values({
    groupId: settledGroup.id,
    fromPersonId: settledFriendPerson.id,
    toPersonId: settledHostPerson.id,
    amount: 150000,
    date: new Date(nowMs - 11 * dayMs),
    mode: 'online',
    description: 'Full settlement for Goa beach dinner via GPay',
    reference: 'UPI/GOA/SETTLED1500',
    status: 'accepted',
    createdByType: 'friend',
    decidedBy: host.id,
    decidedAt: new Date(nowMs - 11 * dayMs + 10 * 60 * 1000),
  });

  await db
    .update(groups)
    .set({ status: 'settled' })
    .where(eq(groups.id, settledGroup.id));

  console.log('✅ Created Settled Group: Goa Weekend Getaway 🏖️ (Net sum: 0, 100% collected)');

  // 11. Verify balances on main group
  const balances = await calculateGroupBalances(group.id);
  console.log('\n📊 Main Group Summary:');
  console.log(`   Total Spent: ₹${(balances.summary.totalSpent / 100).toFixed(2)}`);
  console.log(`   Total Received: ₹${(balances.summary.totalReceived / 100).toFixed(2)}`);
  console.log(`   Total Pending: ₹${(balances.summary.totalPending / 100).toFixed(2)}`);
  console.log(`   Net Sum Invariant: ${balances.summary.netSumCheck} (Expected: 0)`);

  console.log('\n👥 Per-Person Balances:');
  for (const p of balances.people) {
    const roleTag = p.isHost ? '[HOST]' : '[FRIEND]';
    const statusText =
      p.net > 0
        ? `Group owes ₹${(p.groupOwesYou / 100).toFixed(2)}`
        : p.net < 0
        ? `Owes ₹${(p.remainingToPay / 100).toFixed(2)}`
        : 'Settled (₹0)';
    console.log(`   ${roleTag} ${p.name.padEnd(16)}: ${statusText}`);
  }


  console.log('\n🔗 Demo Testing URLs & Credentials:');
  console.log('   👤 Accounts (password for all: hostpassword123 / adminpassword123 / friendpassword123):');
  console.log('      • Admin: admin (@admin)');
  console.log('      • Host:  vikram (@vikram)');
  console.log('      • Friend (Claimed): karan (@karan)');
  console.log('   📄 Level 1 Public View Links:');
  console.log('      • Valid:   /s/demo-share-token-aarav (Aarav)');
  console.log('      • Revoked: /s/demo-revoked-share-token (Dev - should show revoked state)');
  console.log('   🎟️ Level 2 Single-Use Invite Links:');
  console.log('      • Valid:   /invite/DEMO-VALID-INVITE (Neha - ready to claim or register)');
  console.log('      • Expired: /invite/DEMO-EXPIRED-INVITE (Pooja - should show expired state)');
  console.log('   🔑 Admin Password Reset Credentials:');
  console.log('      • Link:  /reset-password?token=demo-admin-reset-token-karan');
  console.log('      • Code:  K7M2-9QXP (User: karan)');

  console.log('\n✨ SplitOrbit database successfully seeded with demo data!\n');
}

seed()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Seeding failed:', err);
    await pool.end();
    process.exit(1);
  });
