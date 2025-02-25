function cleanTimeLine(timelineItems, issue_id){
    let cleanedTL = timelineItems.map(timeline => {
        return {
            'issue_id': issue_id,
            'id': timeline.id,
            'event': 'commented',
            'event_created_at': new Date(timeline.createdAt),
            'user': timeline.author ? '@' + timeline.author.login : null,
            'body': timeline.body,
        }
    })

    return cleanedTL;
}

function cleanIssue(issue){
    return {
        'id': issue.id,
        'issue_id':issue.repository.name + issue.number,
        'title': issue.title,
        'labels': issue.labels.nodes.map(label => label.name),
        'assignees': issue.assignees.nodes ? issue.assignees.nodes.map(assignees => '@'+assignees.login) : null,
        'createdAt': new Date(issue.createdAt),
        'closedAt': new Date(issue.createdAt),
        'daysOpen': issue.closedAt == null ? calculateDaysOpen(issue.createdAt) : calculateDaysOpen(issue.createdAt, issue.closedAt)
    };
}

function calculateDaysOpen(creationString, closedString){
    let dateAux;
    
    const creationDate = new Date(creationString).valueOf();

    if(closedString == null){
        dateAux = Date.now();
    } else {
        dateAux = new Date(closedString).valueOf();
    }

    return ((dateAux - creationDate)/86400000).toFixed(0);
}

export default { cleanTimeLine, cleanIssue };