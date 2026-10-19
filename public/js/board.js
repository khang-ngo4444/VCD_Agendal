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
      // Saves the card's column and the new order of every card in it, top to bottom.
      onEnd: ({ item, from, to, oldIndex, newIndex }) => {
        if (from === to && oldIndex === newIndex) return;
        const fields = new URLSearchParams({ status: to.dataset.column, returnTo: location.pathname + location.search });
        to.querySelectorAll('[data-task-id]').forEach((card) => fields.append('ids', card.dataset.taskId));
        window.agendal.post(`/tasks/${item.dataset.taskId}/move`, fields);
      },
    })
  );
}

setUpBoard();
document.addEventListener('agendal:render', setUpBoard); // the board is swapped in fresh after every change
