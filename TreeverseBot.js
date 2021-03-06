const axios = require('axios');
const { times } = require('lodash');
const {CheckDuplicateThenTweet, LogError} = require('./utility');

const hour = 60*60*1000;
let LastSaleTime = new Date(Date.now() - 20*hour);
const SLUGS = process.env.SLUGS.split(','); //Get slug array.

//Returns an array of opensea successful sale events.
async function GetLatestSales(){

    let allSales = [];

    let searchParams = {
        params:{
            event_type:"successful",
            limit: 5,
            only_opensea: 'false',
            offset:0,
            collection_slug:"",
            occurred_after: LastSaleTime.getTime()/1000,
            
        }
    }

    //Check sales for each slug.
    for (index in SLUGS){
        searchParams.params.collection_slug = SLUGS[index]; //Set the slug.
        console.log(`Getting last 5 ${SLUGS[index]} sales.`);

        var res = await axios.get('https://api.opensea.io/api/v1/events', searchParams);
        allSales = allSales.concat(res.data.asset_events);
    }

    allSales.sort((a,b)=>{
        let diff = (Date.parse(a.transaction.timestamp) - Date.parse(b.transaction.timestamp)) //Sort by date, oldest to newest.

        if (diff < 0)
            return -1;
        if (diff > 0)
            return 1;
        
        return 0;
    });
    return allSales;
}
//Compare timestamps.
function CheckIsNewSale(timestamp){
    let salesTimestamp = Date.parse(timestamp);
    console.log(`Checking ${LastSaleTime.getTime()} <= ${salesTimestamp}`);
    return LastSaleTime.getTime() <= salesTimestamp; //Less than or equal to account for items sold at the exact same time.
}
function BuildTwitterData(sale, multi_sale){
    let twitterData = 
    {
       main_asset: null,
       tree_count: 0,
       plot_count: 0,
       other_asset: false,
       total_price:0,
       payment_token:null,
       seller:null,
       buyer:null,
       permalink: null
    }

    let tempAssets = [];
    if (multi_sale) //Its a bundle.
    {
        tempAssets = sale.asset_bundle.assets;
        twitterData.permalink = sale.asset_bundle.permalink;
    }
    else //Its a normal sale
    tempAssets = [sale.asset];
    

    twitterData.payment_token = sale.payment_token;
    twitterData.total_price = sale.total_price;
    twitterData.seller = sale.seller;
    twitterData.buyer = sale.winner_account;

    for (index in tempAssets){
        var asset = tempAssets[index];
        if (!SLUGS.includes(asset.collection.slug)) twitterData.other_asset = true;//Not what we're looking for, but is part of the bundle.
        else
        {
            twitterData.plot_count += (asset.collection.slug == "treeverse"); //If its a plot, add it to the plot count.
            twitterData.tree_count += (asset.collection.slug == "nftverse"); //If its a tree, add it to the tree count.

            if (twitterData.main_asset == null)
                twitterData.main_asset = asset; //Use asset.

        }
    }

    twitterData.other_asset = twitterData.other_asset || twitterData.plot_count > 1 || twitterData.tree_count > 1 || (twitterData.plot_count > 0 && twitterData.tree_count  > 0);

    return twitterData;
}
function ProcessAllSales(asset_list){
    console.log("Processing sale data.");
    console.log("Last known time: "+LastSaleTime.getTime());

    let NewSaleCount = 0;
    let eventNo = 0;
    console.log(asset_list.length);
    for (index in asset_list){
        var sale = asset_list[index];

        console.log(`-------------------------------------------------------------------------------------------------------\n${eventNo}`);

        if (sale.asset != null)
            console.log(sale.asset.name + ": "+Date.parse(sale.transaction.timestamp)); //Log name and sale time.
        else
            console.log("A Bundle of Assets"+ ": "+Date.parse(sale.transaction.timestamp)); //Log name and sale time.

        if (CheckIsNewSale(sale.transaction.timestamp))
        {
            LastSaleTime = new Date(sale.transaction.timestamp);  //Update the last sale time.
            console.log(`New sale found at: ${LastSaleTime}`);
            console.log("Building tweet.");

            twitterData = BuildTwitterData(sale, sale.asset_bundle != null); //Send all sale data. If asset == null, then the asset_bundle.assets property will be an array of multiple assets.
            CheckDuplicateThenTweet(twitterData);
            NewSaleCount++;
        }

    }

    console.log(`${NewSaleCount} sale(s) are suspected to be new.`);

}

async function pollOpenSeaForSales() {
    try {
        ProcessAllSales(await GetLatestSales());
    } catch(error) {
        LogError(error);
    }
}

//List Slugs
console.log(`SLUGS:${SLUGS}`);
//Start polling opensea.
pollOpenSeaForSales();
setInterval(async () => {
    console.log("---| Start Poll |---");
    pollOpenSeaForSales();
}, 120000);
