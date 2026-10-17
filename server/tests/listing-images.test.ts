import assert from 'node:assert/strict';
import test from 'node:test';
import type { Offer } from '../../shared/contracts/index.js';
import { enrichListingDetails, imageFromListing, listingDataFromHtml } from '../src/listing-images.js';

const jysk = 'https://jysk.fi/makuuhuone/sangyt/lasten-sangyt/sanky-gilleleje-90x200-valkoinen';
const nettiauto = 'https://www.nettiauto.com/en/toyota/corolla/13976291';

test('reads a JYSK product photo from page metadata with reversed attribute order', () => {
  const html = '<meta content="Sänky GILLELEJE 90x200 valkoinen | JYSK" property="og:title">' +
    '<meta content="https://cdn.jysk.com/images/gilleleje.jpg?x=1&amp;y=2" property="og:image">';
  assert.equal(imageFromListing(html, jysk, 'Sänky GILLELEJE 90x200 valkoinen'), 'https://cdn.jysk.com/images/gilleleje.jpg?x=1&y=2');
  assert.equal(imageFromListing(html, jysk, 'Sänky VEMMELEV 140x200'), null);
});

test('reads a Nettiauto listing photo and rejects external tracking images', () => {
  const title = '<meta property="og:title" content="Toyota Corolla 2018 | Nettiauto">';
  assert.equal(imageFromListing(title + '<meta property="og:image" content="https://cdn.nettiauto.com/corolla.jpg">', nettiauto, 'Toyota Corolla 2018'), 'https://cdn.nettiauto.com/corolla.jpg');
  assert.equal(imageFromListing(title + '<meta property="og:image" content="https://nettiauto.com.evil.test/tracker.jpg">', nettiauto, 'Toyota Corolla 2018'), null);
  assert.equal(imageFromListing(title + '<meta property="og:image" content="http://cdn.nettiauto.com/corolla.jpg">', nettiauto, 'Toyota Corolla 2018'), null);
});

test('enrichment only fetches known listing pages and leaves blocked pages without images', async () => {
  const listing = { sourceUrl: nettiauto, title: 'Toyota Corolla 2018', imageUrl: null } as Offer;
  const other = { sourceUrl: 'https://example.org/private', title: 'Other car', imageUrl: null } as Offer;
  const calls: string[] = [];
  await enrichListingDetails([listing, other], async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    return new Response('<meta property="og:title" content="Toyota Corolla 2018"><meta property="og:image" content="https://cdn.nettiauto.com/corolla.jpg">', { headers: { 'content-type': 'text/html' } });
  });
  assert.deepEqual(calls, [nettiauto]);
  assert.equal(listing.imageUrl, 'https://cdn.nettiauto.com/corolla.jpg');
  await enrichListingDetails([listing], async () => { throw new Error('blocked'); });
  assert.equal(listing.imageUrl, 'https://cdn.nettiauto.com/corolla.jpg');
});

test('structured product price is verified from the matching page, including Finnish JYSK prices',()=>{
  const html='<meta property="og:title" content="Sänky GILLELEJE 90x200 valkoinen | JYSK">'+
    '<meta property="og:image" content="https://cdn1.jysk.com/getimage/254155">'+
    '<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'Sänky GILLELEJE 90x200 valkoinen',offers:{price:259,priceCurrency:'EUR',availability:'https://schema.org/InStock',itemCondition:'https://schema.org/NewCondition'}})+'</script>';
  assert.deepEqual(listingDataFromHtml(html,jysk,'Sänky GILLELEJE 90x200 valkoinen'),{imageUrl:'https://cdn1.jysk.com/getimage/254155',priceMinor:25900,availability:'in_stock',condition:'new'});
  assert.equal(listingDataFromHtml(html,jysk,'Sänky VEMMELEV 140x200').priceMinor,null);
});

test('enrichment replaces an estimated JYSK price with listing data', async () => {
  const title='Sänky GILLELEJE 90x200 valkoinen';
  const offer={sourceUrl:jysk,title,imageUrl:null,priceMinor:30000,priceStatus:'estimated',availability:'unknown',condition:'unknown',evidence:['Estimated reported EUR item price.']} as Offer;
  const html='<meta property="og:title" content="Sänky GILLELEJE 90x200 valkoinen | JYSK">'+
    '<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:title,image:'https://cdn1.jysk.com/getimage/254155',offers:{price:'259.00',priceCurrency:'EUR',availability:'https://schema.org/InStock',itemCondition:'https://schema.org/NewCondition'}})+'</script>';
  await enrichListingDetails([offer],async()=>new Response(html,{headers:{'content-type':'text/html'}}));
  assert.equal(offer.imageUrl,'https://cdn1.jysk.com/getimage/254155');
  assert.equal(offer.priceMinor,25900);
  assert.equal(offer.priceStatus,'verified');
  assert.equal(offer.availability,'in_stock');
  assert.equal(offer.condition,'new');
  assert.ok(offer.evidence.some(note=>note.includes('Product structured data')));
});
