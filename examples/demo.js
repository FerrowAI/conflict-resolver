const { merge } = require('../dist/index.js');

const base = {
  title: 'Draft',
  status: 'open',
  views: 10,
  tags: ['a', 'b'],
  owner: 'alice',
};

// disjoint edit: local changes title only
const local = {
  title: 'Draft v2',
  status: 'open',
  views: 10,
  tags: ['a', 'b', 'c'],
  owner: 'alice',
};

// overlapping edit: remote changes status (conflict with nothing local changed there -> auto merge)
// AND remote changes title too (real conflict with local's title change)
// AND remote changes tags (conflict, array strategy)
const remote = {
  title: 'Draft (remote edit)',
  status: 'closed',
  views: 10,
  tags: ['a', 'd'],
  owner: 'alice',
};

const result = merge(base, local, remote, {
  strategy: 'lastWrite',
  timestamps: {
    local: { title: 1000 },
    remote: { title: 2000 },
  },
  arrayStrategy: 'union',
});

console.log('merged:', JSON.stringify(result.merged, null, 2));
console.log('\nconflicts:');
for (const c of result.conflicts) {
  console.log(` - ${c.field}: base=${JSON.stringify(c.base)} local=${JSON.stringify(c.local)} remote=${JSON.stringify(c.remote)} -> resolved=${JSON.stringify(c.resolved)} (${c.resolution})`);
}

console.log('\nnon-conflicting field "status" auto-merged from remote:', result.merged.status === 'closed');
console.log('unchanged field "views" preserved:', result.merged.views === 10);

// custom resolver per field
const result2 = merge(
  { score: 5 },
  { score: 7 },
  { score: 9 },
  { fieldStrategies: { score: ({ local: l, remote: r }) => Math.max(l, r) } }
);
console.log('\ncustom resolver (max):', result2.merged.score, result2.conflicts[0].resolution);
