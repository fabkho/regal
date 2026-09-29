# bookshelf-3d

Upload your Goodreads library export and browse it as a 3D bookcase. Pull a book off the shelf, turn it around, see what you thought of it.

Built with Nuxt 4 and [TresJS](https://tresjs.org) (three.js for Vue).

## Status

Planning. Spec: [#1](https://github.com/fabkho/bookshelf-3d/issues/1).

## Getting your Goodreads export

Goodreads → My Books → Import and export → **Export Library**. You get `goodreads_library_export.csv`. The file is parsed in your browser; only ISBN, title and author are sent to the server to look up covers.
