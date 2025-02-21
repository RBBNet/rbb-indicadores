function mapNodes(orgs, net, idMap) {
    for (let i = 0; i < orgs.length; i++){
        for (let j = 0; j < orgs[i].nodes.length; j++){
            const node = Object.assign({}, orgs[i].nodes[j]);
            node.organization = orgs[i].organization;
            node.net = net;
            if(node.id) {
                idMap.set(node.id, node);
            }
        }
    }
}

async function translateMetrics(metricas, idMap) {
    let responseBody = []
    for (let i = 0; i < metricas.length; i++) {
        let body = {}
        let node = idMap.get(metricas[i].address);
        if (node !== null){
            try{
                body.organization = node.organization;
                body.node = node.name;
            }
            catch(err){
                body.organization = `Unknown${i}`;
                body.node = `Unknown${i}`;
            }
        } else {
            body.organization = `Unknown${i}`;
            body.node = `Unknown${i}`;
        }

        body.proposedBlockCount = parseInt(metricas[i].proposedBlockCount);
        body.lastProposedBlockNumber = parseInt(metricas[i].lastProposedBlockNumber);
        responseBody.push(body);
    }
    return responseBody;
}

export default {mapNodes,translateMetrics};