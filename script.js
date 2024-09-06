    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(script);

    // Подключаемся к IndexedDB

    const storeName = 'page';

    // Открываем IndexedDB
    function openDB() {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open('reader2viewer');
            request.onerror = event => reject('Error opening IndexedDB');
            request.onsuccess = event => resolve(event.target.result);
        });
    }

    // Получаем все записи из хранилища IndexedDB
    async function getDataAndGeneratePDF() {
        let db = await openDB();
        let transaction = db.transaction([storeName], 'readonly');
        let objectStore = transaction.objectStore(storeName);
        let data = [];

        objectStore.openCursor().onsuccess = function (event) {
            let cursor = event.target.result;
            if (cursor) {
                data.push({
                    key: cursor.key,
                    slices: cursor.value.slices
                });
                cursor.continue();
            } else {
                console.log('Все данные получены.');
                processAndGeneratePDF(data);
            }
        };
    }

    // Обрабатываем данные и генерируем PDF для каждой книги
    function processAndGeneratePDF(data) {
        // Сортировка данных по ключу, сначала ID книги, затем номер страницы
        data.sort((a, b) => {
            let [bookIdA, pageA] = a.key.split(':').map(Number);
            let [bookIdB, pageB] = b.key.split(':').map(Number);

            // Сравниваем сначала ID книги, потом номер страницы
            return bookIdA === bookIdB ? pageA - pageB : bookIdA - bookIdB;
        });

        // Группировка страниц по книге
        let books = {};
        data.forEach(item => {
            let [bookId, page] = item.key.split(':').map(Number);
            if (!books[bookId]) {
                books[bookId] = [];
            }
            books[bookId].push(item.slices);
        });

        // Генерация PDF для каждой книги
        const currentBook = Number(window.location.search.replace('?id=', ''));
        let isFound = false;
        for (let bookId in books) {
            if (currentBook == bookId) {
                generatePDFForBook(bookId, books[bookId]);
                isFound = true;
            }
        }
        if (!isFound) {
            console.log('Книга не загружена.')
        }
    }

    // Функция генерации PDF для одной книги
    async function generatePDFForBook(bookId, pages) {
        const {jsPDF} = window.jspdf;
        let doc = new jsPDF(); // Используем библиотеку jsPDF для генерации PDF
        for (const slices of pages) {
            const index = pages.indexOf(slices);
            // Объединяем все куски (slices) в одну страницу
            let imgData = await combineSlices(slices);

            // Добавляем страницу в PDF
            if (index !== 0) {
                doc.addPage();
            }
            doc.addImage(imgData, 'JPEG', 0, 0, 210, 297); // Размер страницы A4 (210x297 мм)
        }

        // Сохраняем PDF файл для каждой книги
        doc.save(`book_${bookId}.pdf`);
        console.log(`PDF для книги ${bookId} создан.`);
    }

    function base64ToImage(base64Data) {
        return new Promise((resolve, reject) => {
            let img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = base64Data;
        });
    }


    async function combineSlices(slices) {
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');

        let totalHeight = 0;
        let sliceImages = [];

        // Загружаем каждый кусок как изображение и подсчитываем общую высоту
        for (let slice of slices) {
            if (slice) {
                let img = await base64ToImage(slice);
                sliceImages.push(img);
                totalHeight += img.height;
            }
        }

        // Ширина берется от первого изображения, предполагается, что все куски имеют одинаковую ширину
        canvas.width = sliceImages[0].width;
        canvas.height = totalHeight;

        // Рисуем все куски один за другим
        let currentY = 0;
        for (let img of sliceImages) {
            ctx.drawImage(img, 0, currentY, img.width, img.height);
            currentY += img.height;
        }

        // Возвращаем изображение в формате Base64
        return canvas.toDataURL('image/jpeg');
    }


    getDataAndGeneratePDF()
