// Board drag and drop (views/board.ejs) with SortableJS, which also works on touch screens.
// Every card's "Move to" menu does the same without dragging.

function setUpBoard() {
  document.querySelectorAll('[data-column]').forEach((list) =>
    Sortable.create(list, {
      group: 'board',
      animation: 150,
      delay: 150, // on touch screens a short press still scrolls the board
      delayOnTouchOnly: true,
      filter: 'details', // the menu button opens its menu instead of starting a drag
      preventOnFilter: false,
      ghostClass: 'opacity-40',
      onEnd: ({ item, from, to }) => {
        if (from === to) return;
        window.agendal.post(`/tasks/${item.dataset.taskId}/move`, { status: to.dataset.column, returnTo: location.pathname + location.search });
      },
    })
  );
}

setUpBoard();
document.addEventListener('agendal:render', setUpBoard); // the board is swapped in fresh after every change
