#!/usr/bin/env node
// The showcase shelf (demo/showcase-library.json), a synthetic Regal library
// file for the playground: public-domain works with invented ratings, dates,
// reviews, blurbs and ISBNs; Spine colours from a fixed palette. No real
// person's reading data. Then draw its fronts with covers.mjs:
//
//   node scripts/showcase/shelf.mjs > demo/showcase-library.json && node scripts/showcase/covers.mjs
const P = [
  ['#2f4858', '#f5f2eb', '#d4b06a'], ['#7a2e26', '#f3e9d8', '#e3c27a'], ['#3d5a3a', '#f5f2eb', '#d4b06a'],
  ['#1f3a5f', '#efe7d6', '#c9a227'], ['#5b4a3a', '#f2ead9', '#c58b4c'], ['#8c6d3f', '#1f1d1a', '#5c1f16'],
  ['#2c2c2a', '#f5f2eb', '#b93e2e'], ['#4b5d67', '#f0ebe0', '#e0a458'], ['#6a2c4f', '#f6ecdf', '#d9a5b3'],
  ['#c9b98f', '#2c2c2a', '#7a2e26'], ['#365f63', '#f3eee2', '#e6c068'], ['#9b3d2e', '#f7efe1', '#2c2c2a'],
  ['#e8dcc0', '#2c2c2a', '#b93e2e'], ['#284139', '#ece4d0', '#d9b26f'], ['#5a3d5c', '#f1e9dc', '#cfa96b'],
  ['#a7754d', '#1f1b16', '#f4ead5'],
]
const B = [
  // title, author, series, pages, binding, origYear, status, dateRead, rating, review, spoiler, genre, blurb
  ['The Count of Monte Cristo', 'Alexandre Dumas', null, 1276, 'Paperback', 1844, 'currently-reading', null, 0, null, false, 'ADVENTURE', 'A sailor betrayed on his wedding day escapes prison and returns, rich and patient, to settle every account.'],
  ['Persuasion', 'Jane Austen', null, 249, 'Hardcover', 1817, 'currently-reading', null, 0, null, false, 'FICTION', 'Eight years after she was talked out of an engagement, Anne Elliot meets the man again.'],
  ['The Picture of Dorian Gray', 'Oscar Wilde', null, 254, 'Paperback', 1890, 'read', '2026-04-12', 4.5, 'Every line is a quotation waiting to happen.', false, 'CLASSICS', 'A young man stays beautiful while his portrait ages and darkens with every sin.'],
  ['The War of the Worlds', 'H. G. Wells', null, 192, 'Mass Market Paperback', 1898, 'read', '2026-03-29', 4, 'The heat-ray still feels modern.', false, 'SCIENCE FICTION', 'Cylinders fall on Surrey, and something climbs out.'],
  ['Dracula', 'Bram Stoker', null, 418, 'Paperback', 1897, 'read', '2026-03-02', 4.25, 'Told in letters and diaries, which makes it creep closer.', false, 'HORROR', 'A solicitor travels to Transylvania to sell a house to a count who never eats.'],
  ['The Hound of the Baskervilles', 'Arthur Conan Doyle', 'Sherlock Holmes, #3', 256, 'Paperback', 1902, 'read', '2026-02-14', 4, 'Holmes is offstage for half of it and it still works.', false, 'MYSTERY', 'A family curse, a moor, and a hound that leaves enormous footprints.'],
  ['A Study in Scarlet', 'Arthur Conan Doyle', 'Sherlock Holmes, #1', 188, 'Paperback', 1887, 'read', '2026-01-20', 3.5, 'The Utah half is a detour, but the first meeting is perfect.', false, 'MYSTERY', 'Dr Watson needs cheap lodgings and is introduced to a strange flatmate.'],
  ['Twenty Thousand Leagues Under the Seas', 'Jules Verne', null, 426, 'Hardcover', 1870, 'read', '2026-01-03', 3.75, 'Too many fish lists, worth it for Nemo.', false, 'ADVENTURE', 'A professor hunting a sea monster ends up a guest aboard the Nautilus.'],
  ['Little Women', 'Louisa May Alcott', null, 759, 'Paperback', 1868, 'read', '2025-12-18', 4.5, 'Jo March forever.', false, 'FICTION', 'Four sisters grow up in Massachusetts while their father is away at war.'],
  ['The Adventures of Huckleberry Finn', 'Mark Twain', null, 366, 'Paperback', 1884, 'read', '2025-11-30', 4, null, false, 'CLASSICS', 'A boy and an escaped slave float down the Mississippi on a raft.'],
  ['Wuthering Heights', 'Emily Brontë', null, 416, 'Hardcover', 1847, 'read', '2025-11-08', 3.25, 'Everyone is terrible and the weather is worse.', false, 'FICTION', 'A foundling taken in by the Earnshaws grows up to ruin two families.'],
  ['The Strange Case of Dr Jekyll and Mr Hyde', 'Robert Louis Stevenson', null, 92, 'Paperback', 1886, 'read', '2025-10-31', 4, 'Perfect for one evening.', false, 'HORROR', 'A lawyer investigates the link between a respected doctor and a brutal stranger.'],
  ['Pride and Prejudice', 'Jane Austen', null, 432, 'Hardcover', 1813, 'read', '2025-10-05', 5, 'Better every time.', false, 'FICTION', 'Elizabeth Bennet meets Mr Darcy and dislikes him at once.'],
  ['The Call of the Wild', 'Jack London', null, 172, 'Mass Market Paperback', 1903, 'read', '2025-09-14', 3.75, null, false, 'ADVENTURE', 'A house dog is stolen and sold into the Klondike gold rush.'],
  ['Treasure Island', 'Robert Louis Stevenson', null, 311, 'Paperback', 1883, 'read', '2025-08-22', 4.25, 'Long John Silver is the best villain who is also a friend.', false, 'ADVENTURE', 'A boy finds a map in a dead pirate\'s sea chest.'],
  ['Jane Eyre', 'Charlotte Brontë', null, 532, 'Paperback', 1847, 'read', '2025-08-01', 4.75, 'The attic. Of course the attic.', true, 'FICTION', 'An orphan becomes a governess at Thornfield Hall and hears laughter at night.'],
  ['The Jungle Book', 'Rudyard Kipling', null, 277, 'Hardcover', 1894, 'read', '2025-07-04', 3.5, null, false, 'CHILDREN', 'A boy raised by wolves learns the Law of the Jungle.'],
  ['Around the World in Eighty Days', 'Jules Verne', null, 248, 'Paperback', 1872, 'read', '2025-06-15', 4, 'A travel brochure with a stopwatch.', false, 'ADVENTURE', 'Phileas Fogg bets his fortune that he can circle the globe in eighty days.'],
  ['The Metamorphosis', 'Franz Kafka', null, 84, 'Paperback', 1915, 'read', '2025-05-27', 4.25, 'The family is the horror.', false, 'CLASSICS', 'Gregor Samsa wakes up one morning as an enormous insect.'],
  ['Great Expectations', 'Charles Dickens', null, 544, 'Paperback', 1861, 'read', '2025-05-03', 4, null, false, 'CLASSICS', 'An orphan blacksmith\'s boy is given money by a secret benefactor.'],
  ['The Importance of Being Earnest', 'Oscar Wilde', null, 76, 'Paperback', 1895, 'read', '2025-04-12', 4.75, 'Read it aloud.', false, 'DRAMA', 'Two young men invent people to escape their obligations.'],
  ['Heart of Darkness', 'Joseph Conrad', null, 96, 'Paperback', 1899, 'read', '2025-03-20', 3, 'Dense fog, on purpose.', false, 'CLASSICS', 'A steamer captain goes up the Congo to find a trader named Kurtz.'],
  ['Alice\'s Adventures in Wonderland', 'Lewis Carroll', null, 176, 'Hardcover', 1865, 'read', '2025-02-28', 4.5, 'Still the best logic puzzles in fiction.', false, 'CHILDREN', 'A girl follows a white rabbit down a hole.'],
  ['Through the Looking-Glass', 'Lewis Carroll', null, 208, 'Hardcover', 1871, 'read', '2025-02-09', 4, null, false, 'CHILDREN', 'Alice steps through a mirror into a world laid out like a chessboard.'],
  ['The Scarlet Letter', 'Nathaniel Hawthorne', null, 272, 'Paperback', 1850, 'read', '2025-01-18', 2.75, 'Admired more than enjoyed.', false, 'CLASSICS', 'In Puritan Boston a woman is made to wear a red letter A.'],
  ['Emma', 'Jane Austen', null, 474, 'Paperback', 1815, 'read', '2024-12-22', 4.25, 'Emma is wrong about everything, charmingly.', false, 'FICTION', 'A rich young woman matchmakes for her friends with unfortunate results.'],
  ['A Christmas Carol', 'Charles Dickens', null, 104, 'Hardcover', 1843, 'read', '2024-12-14', 4.5, 'Every December.', false, 'CLASSICS', 'A miser is visited by three spirits on Christmas Eve.'],
  ['The Time Machine', 'H. G. Wells', null, 118, 'Paperback', 1895, 'read', '2024-11-02', 3.75, null, false, 'SCIENCE FICTION', 'A Victorian inventor travels to the year 802,701.'],
  ['Frankenstein', 'Mary Shelley', null, 280, 'Hardcover', 1818, 'read', '2024-10-19', 4.75, 'The creature is the most human character in it.', false, 'HORROR', 'A young scientist builds a living being and then abandons it.'],
  ['The Secret Garden', 'Frances Hodgson Burnett', null, 331, 'Paperback', 1911, 'read', '2024-09-07', 4, null, false, 'CHILDREN', 'A spoiled orphan finds a locked garden on her uncle\'s Yorkshire estate.'],
  ['Moby-Dick', 'Herman Melville', null, 720, 'Paperback', 1851, 'read', '2024-08-11', 3.5, 'The whale chapters are the point. I was wrong before.', false, 'CLASSICS', 'Ishmael signs on with a captain who wants one particular whale.'],
  ['The Wind in the Willows', 'Kenneth Grahame', null, 224, 'Hardcover', 1908, 'read', '2024-07-06', 4.25, 'Poop-poop!', false, 'CHILDREN', 'Mole, Rat, Badger and the reckless Toad along the riverbank.'],
  ['Sense and Sensibility', 'Jane Austen', null, 409, 'Paperback', 1811, 'read', '2024-05-25', 3.75, null, false, 'FICTION', 'Two sisters, one sensible and one romantic, lose their home and fall in love.'],
  ['The Thirty-Nine Steps', 'John Buchan', null, 138, 'Mass Market Paperback', 1915, 'read', '2024-04-13', 3.5, 'The ur-thriller: running across moors.', false, 'THRILLER', 'A bored Londoner finds a spy dead in his flat and runs for Scotland.'],
  ['Middlemarch', 'George Eliot', null, 880, 'Paperback', 1871, 'read', '2024-03-02', 5, 'The best novel about ordinary lives.', false, 'FICTION', 'A provincial town, its marriages, its ambitions and its railway.'],
  ['The Odyssey', 'Homer', null, 592, 'Hardcover', -700, 'read', '2024-01-27', 4.5, null, false, 'POETRY', 'Ten years after Troy, one man is still trying to get home.'],
  ['War and Peace', 'Leo Tolstoy', null, 1296, 'Hardcover', 1869, 'to-read', null, 0, null, false, 'FICTION', 'Five aristocratic families through the Napoleonic wars.'],
  ['Don Quixote', 'Miguel de Cervantes', null, 1072, 'Paperback', 1605, 'to-read', null, 0, null, false, 'CLASSICS', 'A gentleman reads too many romances and becomes a knight.'],
]
const isbn13 = (n) => {
  const base = `978000001${String(n).padStart(3, '0')}`
  const sum = [...base].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0)
  return base + ((10 - (sum % 10)) % 10)
}
function addDays(date, days) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}
const books = B.map(([title, author, series, pages, binding, originalYear, status, dateRead, rating, review, spoiler, genre, blurb], i) => {
  const [background, text, accent] = P[i % P.length]
  const days = Math.max(3, Math.round(pages / 25))
  const book = {
    id: `shelf-${String(i + 1).padStart(2, '0')}`, title, ...(series ? { seriesTitle: series } : {}), authors: [author],
    isbn13: isbn13(i + 1), pages, binding, yearPublished: 2000 + (i * 7) % 25, originalYear, status,
  }
  if (dateRead) Object.assign(book, { dateRead, dateStarted: addDays(dateRead, -days), dateAdded: addDays(dateRead, -days - 14) })
  else if (status === 'currently-reading') Object.assign(book, { dateStarted: i === 0 ? '2026-04-20' : '2026-04-28', dateAdded: '2026-04-01' })
  else book.dateAdded = '2026-03-15'
  book.rating = rating
  if (review) Object.assign(book, { review, reviewHasSpoiler: spoiler })
  book.readCount = status === 'read' ? (i % 9 === 4 ? 2 : 1) : 0
  Object.assign(book, { description: blurb, publisher: 'Example Classics', genre })
  book.assets = { palette: { background, text, accent }, spineColor: background }
  return book
})
const file = { version: 2, generatedAt: '2026-05-01T06:00:00Z', owner: 'Demo Reader', generator: 'hand-written showcase fixture (synthetic): public-domain titles; ratings, dates, reviews, blurbs and ISBNs invented', books }
process.stdout.write(`${JSON.stringify(file, null, 2)}\n`)
