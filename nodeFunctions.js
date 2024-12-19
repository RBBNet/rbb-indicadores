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
            body.organization = node.organization;
            body.node = node.name;
        } else {
            body.organization = "Unknown";
            body.node = "Unknown";
        }

        body.proposedBlockCount = parseInt(metricas[i].proposedBlockCount);
        body.lastProposedBlockNumber = parseInt(metricas[i].lastProposedBlockNumber);
        responseBody.push(body);
    }
    return responseBody;
}

module.exports = {
    mapNodes: mapNodes,
    translateMetrics: translateMetrics
}